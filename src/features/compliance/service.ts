import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import { parseFinancialYear, recentFinancialYears } from "@/lib/domain/financial-year";
import { buildAlerts } from "@/lib/domain/obligations/alerts";
import { calculateCompliance, type ComplianceResult } from "@/lib/domain/obligations/calculate";
import type { Rule } from "@/lib/domain/rules/resolve";

type Org = { id: string; wasteStreams: string[] };

/** Loads everything the engine needs for one FY and runs it. Read-only. */
export async function computeCompliance(db: TenantDb, org: Org, financialYear: string, today = new Date()): Promise<ComplianceResult> {
  const { startYear } = parseFinancialYear(financialYear);
  const years = recentFinancialYears(new Date(Date.UTC(startYear, 6, 1)), 4); // this FY + previous 3

  const [categories, quantities, certificates, rules] = await Promise.all([
    db.materialCategory.findMany({
      where: { stream: { in: org.wasteStreams as never } },
      select: { id: true, code: true, name: true, stream: true, sortOrder: true },
    }),
    db.materialEntry.findMany({
      where: { deletedAt: null, financialYear: { in: years } },
      select: {
        financialYear: true,
        categoryId: true,
        entityType: true,
        stateCode: true,
        quantityKg: true,
        recycledContentKg: true,
        isPreConsumer: true,
      },
    }),
    db.certificate.findMany({
      where: { deletedAt: null, status: "APPROVED", financialYear },
      select: { financialYear: true, categoryId: true, type: true, quantityKg: true, costInr: true },
    }),
    db.regulationRule.findMany({ where: { stream: { in: org.wasteStreams as never } } }),
  ]);

  return calculateCompliance({
    financialYear,
    categories,
    quantities: quantities.map((q) => ({
      ...q,
      quantityKg: Number(q.quantityKg),
      recycledContentKg: q.recycledContentKg === null ? null : Number(q.recycledContentKg),
    })),
    certificates: certificates.map((c) => ({
      ...c,
      quantityKg: Number(c.quantityKg),
      costInr: c.costInr === null ? null : Number(c.costInr),
    })),
    rules: rules.map(
      (r): Rule => ({
        id: r.id,
        stream: r.stream,
        categoryId: r.categoryId,
        entityType: r.entityType,
        ruleType: r.ruleType,
        financialYear: r.financialYear,
        value: Number(r.value),
        unit: r.unit,
        parameters: (r.parameters as Record<string, unknown> | null) ?? null,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        version: r.version,
        isVerified: r.isVerified,
      }),
    ),
    today,
  });
}

const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Persists the current obligation snapshot and reconciles alerts for that FY:
 * new conditions are opened, changed ones updated, and conditions that no longer
 * hold are marked resolved. Idempotent and cheap when nothing changed (no writes),
 * so it is safe to run after every dashboard view and from the daily cron.
 */
export async function syncCompliance(db: TenantDb, org: Org, result: ComplianceResult, today = new Date()) {
  const fy = result.financialYear;
  await Promise.all([syncSnapshot(db, org, result, today), syncAlerts(db, org, fy, buildAlerts(result, today), today)]);
}

async function syncSnapshot(db: TenantDb, org: Org, result: ComplianceResult, today: Date) {
  const fy = result.financialYear;
  const signature = (rows: { categoryId: string; targetKg: string; fulfilledKg: string }[]) =>
    rows
      .map((r) => `${r.categoryId}:${Number(r.targetKg).toFixed(3)}:${Number(r.fulfilledKg).toFixed(3)}`)
      .sort()
      .join("|");

  const current = await db.obligationSnapshot.findMany({
    where: { financialYear: fy, isCurrent: true },
    select: { categoryId: true, targetKg: true, fulfilledKg: true, computedAt: true },
  });
  const fresh = current.length > 0 && today.getTime() - current[0].computedAt.getTime() < SNAPSHOT_MAX_AGE_MS;
  const next = result.lines.map((l) => ({ categoryId: l.category.id, targetKg: l.targetKg.toFixed(3), fulfilledKg: l.fulfilledKg.toFixed(3) }));
  const unchanged = signature(current.map((c) => ({ ...c, targetKg: c.targetKg.toString(), fulfilledKg: c.fulfilledKg.toString() }))) === signature(next);
  if (unchanged && fresh) return;

  // Batch transaction: a single round trip, no long-lived interactive transaction.
  await db.$transaction([
    db.obligationSnapshot.deleteMany({ where: { financialYear: fy, isCurrent: false, computedAt: { lt: new Date(today.getTime() - 90 * 86_400_000) } } }),
    db.obligationSnapshot.updateMany({ where: { financialYear: fy, isCurrent: true }, data: { isCurrent: false } }),
    db.obligationSnapshot.createMany({
      data: result.lines.map((l) => ({
        organizationId: org.id,
        financialYear: fy,
        categoryId: l.category.id,
        entityType: (l.entityTypes[0] ?? "BRAND_OWNER") as never,
        stateCode: null,
        ruleType: "EPR_TARGET" as const,
        baseQuantityKg: l.baseQuantityKg.toFixed(3),
        targetPercent: (l.targetPercent ?? 0).toFixed(4),
        targetKg: l.targetKg.toFixed(3),
        fulfilledKg: l.fulfilledKg.toFixed(3),
        shortfallKg: l.shortfallKg.toFixed(3),
        estimatedEcInr: l.estimatedEcInr.toFixed(2),
        ruleIds: l.rules.map((r) => r.id),
        computedAt: today,
      })),
    }),
  ]);
}

async function syncAlerts(db: TenantDb, org: Org, fy: string, specs: ReturnType<typeof buildAlerts>, today: Date) {
  const existing = await db.alert.findMany({ where: { dedupeKey: { contains: `:${fy}` } } });
  const byKey = new Map(existing.map((a) => [a.dedupeKey, a]));
  const wanted = new Set(specs.map((s) => s.dedupeKey));

  const creates = specs.filter((s) => !byKey.has(s.dedupeKey));
  const updates = specs.filter((s) => {
    const a = byKey.get(s.dedupeKey);
    return a && (a.resolvedAt !== null || a.title !== s.title || a.body !== s.body || a.severity !== s.severity);
  });
  const resolves = existing.filter((a) => a.resolvedAt === null && !wanted.has(a.dedupeKey)).map((a) => a.id);
  if (!creates.length && !updates.length && !resolves.length) return;

  await Promise.all([
    creates.length
      ? db.alert.createMany({
          data: creates.map((a) => ({ organizationId: org.id, dedupeKey: a.dedupeKey, severity: a.severity, title: a.title, body: a.body, link: a.link })),
          skipDuplicates: true, // a concurrent sync may have created it a moment ago
        })
      : null,
    ...updates.map((a) =>
      db.alert.updateMany({
        where: { dedupeKey: a.dedupeKey },
        // A condition that worsened or re-opened is shown as new again.
        data: { severity: a.severity, title: a.title, body: a.body, link: a.link, resolvedAt: null, ...(byKey.get(a.dedupeKey)?.severity !== a.severity ? { readAt: null } : {}) },
      }),
    ),
    resolves.length ? db.alert.updateMany({ where: { id: { in: resolves } }, data: { resolvedAt: today } }) : null,
  ]);
}
