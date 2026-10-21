import "server-only";
import { prisma } from "@/lib/db/client";
import type { TenantDb } from "@/lib/db/tenant";
import { median, runFraudChecks, type Flag } from "@/lib/domain/fraud/checks";
import { istToday } from "@/lib/domain/deadlines/schedule";

const LIVE = { deletedAt: null, status: { not: "REJECTED" as const } };

/**
 * Builds the fraud context for one certificate and reconciles its flags:
 * new findings open a flag, changed ones are updated, findings that no longer
 * apply are resolved automatically, and flags a person dismissed stay dismissed.
 *
 * Cross-tenant facts are read with the base client but only as aggregates
 * (counts, sums, a median) — nothing identifying another organisation leaves here.
 */
export async function refreshCertificateFlags(db: TenantDb, certificateId: string, now = new Date()) {
  const cert = await db.certificate.findUnique({
    where: { id: certificateId },
    include: { file: { select: { sha256: true } } },
  });
  if (!cert || cert.deletedAt) return [];

  const [otherOrgDuplicates, duplicateFileCount, recycler, capacities, issued, prices] = await Promise.all([
    prisma.certificate.count({
      where: { ...LIVE, certificateNumberNormalized: cert.certificateNumberNormalized, organizationId: { not: cert.organizationId } },
    }),
    cert.file
      ? prisma.certificate.count({ where: { deletedAt: null, id: { not: cert.id }, file: { sha256: cert.file.sha256 } } })
      : Promise.resolve(0),
    prisma.recycler.findUniqueOrThrow({
      where: { id: cert.recyclerId },
      select: { verificationStatus: true, registrationValidFrom: true, registrationValidTo: true },
    }),
    prisma.recyclerCapacity.findMany({ where: { recyclerId: cert.recyclerId }, select: { categoryId: true, financialYear: true, annualCapacityKg: true } }),
    prisma.certificate.aggregate({
      where: { ...LIVE, id: { not: cert.id }, recyclerId: cert.recyclerId, categoryId: cert.categoryId, financialYear: cert.financialYear },
      _sum: { quantityKg: true },
    }),
    prisma.certificate.findMany({
      where: { deletedAt: null, status: "APPROVED", categoryId: cert.categoryId, financialYear: cert.financialYear, pricePerKgInr: { not: null }, id: { not: cert.id } },
      select: { pricePerKgInr: true },
      take: 5000,
    }),
  ]);

  const thisYear = capacities.filter((c) => c.financialYear === cert.financialYear);
  const capacity = thisYear.find((c) => c.categoryId === cert.categoryId);
  const priceValues = prices.map((p) => Number(p.pricePerKgInr));

  const flags = runFraudChecks(
    {
      financialYear: cert.financialYear,
      categoryId: cert.categoryId,
      quantityKg: Number(cert.quantityKg),
      issueDate: cert.issueDate,
      transferDate: cert.transferDate,
      pricePerKgInr: cert.pricePerKgInr === null ? null : Number(cert.pricePerKgInr),
    },
    {
      today: istToday(now),
      sameOrgDuplicates: 0, // enforced by the unique index; the form reports it before saving
      otherOrgDuplicates,
      duplicateFileCount,
      recycler: {
        verificationStatus: recycler.verificationStatus,
        registrationValidFrom: recycler.registrationValidFrom,
        registrationValidTo: recycler.registrationValidTo,
        registeredCategoryIds: capacities.length ? thisYear.map((c) => c.categoryId) : null,
        capacityKg: capacity ? Number(capacity.annualCapacityKg) : null,
      },
      issuedByRecyclerKg: Number(issued._sum.quantityKg ?? 0),
      marketMedianPricePerKg: median(priceValues),
      marketSampleSize: priceValues.length,
    },
  );

  await syncFlags(db, cert.organizationId, cert.id, flags, now);
  return flags;
}

async function syncFlags(db: TenantDb, organizationId: string, certificateId: string, flags: Flag[], now: Date) {
  const existing = await db.certificateFlag.findMany({ where: { certificateId } });
  const byType = new Map(existing.map((f) => [f.type, f]));
  const wanted = new Set(flags.map((f) => f.type));

  await Promise.all([
    ...flags.map((f) => {
      const current = byType.get(f.type);
      if (!current) {
        return db.certificateFlag.create({
          data: { organizationId, certificateId, type: f.type, severity: f.severity, message: f.message, details: (f.details ?? undefined) as never },
        });
      }
      const changed = current.message !== f.message || current.severity !== f.severity;
      // A dismissed flag stays dismissed unless the finding got more severe.
      const reopen = current.status === "RESOLVED" || (current.status === "DISMISSED" && rank(f.severity) > rank(current.severity));
      if (!changed && !reopen) return null;
      return db.certificateFlag.update({
        where: { id: current.id },
        data: {
          severity: f.severity,
          message: f.message,
          details: (f.details ?? undefined) as never,
          ...(reopen ? { status: "OPEN" as const, resolvedAt: null, resolvedById: null, resolutionNote: null } : {}),
        },
      });
    }),
    ...existing
      .filter((f) => f.status === "OPEN" && !wanted.has(f.type))
      .map((f) =>
        db.certificateFlag.update({
          where: { id: f.id },
          data: { status: "RESOLVED", resolvedAt: now, resolutionNote: "The condition no longer applies." },
        }),
      ),
  ]);
}

const rank = (s: string) => (s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1);

/**
 * Re-checks open certificates of every organisation (daily cron): capacity and
 * cross-tenant duplicates change as other organisations add certificates.
 */
export async function refreshOpenCertificates(getDb: (orgId: string) => TenantDb, now = new Date()) {
  const open = await prisma.certificate.findMany({
    where: { deletedAt: null, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
    select: { id: true, organizationId: true },
    take: 2000,
  });
  for (const c of open) await refreshCertificateFlags(getDb(c.organizationId), c.id, now);
  return open.length;
}
