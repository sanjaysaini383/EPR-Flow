import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type Role, type WasteStream } from "../src/generated/prisma/client";
import { buildStatutoryDeadlines } from "../src/lib/domain/deadlines/statutory";
import { financialYearOf, formatFinancialYear, parseFinancialYear } from "../src/lib/domain/financial-year";
import { gstinCheckDigit } from "../src/lib/domain/gstin";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

const CATEGORIES: { code: string; stream: WasteStream; name: string; description: string }[] = [
  {
    code: "PLASTIC_CAT_I",
    stream: "PLASTIC",
    name: "Category I – Rigid plastic packaging",
    description: "Rigid plastic packaging.",
  },
  {
    code: "PLASTIC_CAT_II",
    stream: "PLASTIC",
    name: "Category II – Flexible plastic packaging",
    description:
      "Flexible plastic packaging of single or multilayer of different plastics, plastic sheets, covers, carry bags, pouches.",
  },
  {
    code: "PLASTIC_CAT_III",
    stream: "PLASTIC",
    name: "Category III – Multi-layered plastic packaging",
    description: "At least one layer of plastic and at least one layer of material other than plastic.",
  },
  {
    code: "PLASTIC_CAT_IV",
    stream: "PLASTIC",
    name: "Category IV – Compostable plastic packaging",
    description: "Plastic sheets or similar and carry bags made of compostable plastics.",
  },
  { code: "EWASTE_ITEW", stream: "EWASTE", name: "IT & telecommunication equipment", description: "Schedule I – ITEW" },
  { code: "EWASTE_CEEW", stream: "EWASTE", name: "Consumer electrical & electronics", description: "Schedule I – CEEW" },
  { code: "EWASTE_LSEEW", stream: "EWASTE", name: "Large & small electrical equipment", description: "Schedule I – LSEEW" },
  { code: "EWASTE_EETW", stream: "EWASTE", name: "Electrical & electronic tools", description: "Schedule I – EETW" },
  { code: "EWASTE_TEW", stream: "EWASTE", name: "Toys, leisure & sports equipment", description: "Schedule I – TEW" },
  { code: "EWASTE_MDW", stream: "EWASTE", name: "Medical devices", description: "Schedule I – MDW" },
  { code: "EWASTE_LIW", stream: "EWASTE", name: "Laboratory instruments", description: "Schedule I – LIW" },
  { code: "BATTERY_PORTABLE", stream: "BATTERY", name: "Portable battery", description: "" },
  { code: "BATTERY_AUTOMOTIVE", stream: "BATTERY", name: "Automotive battery", description: "" },
  { code: "BATTERY_INDUSTRIAL", stream: "BATTERY", name: "Industrial battery", description: "" },
  { code: "BATTERY_EV", stream: "BATTERY", name: "Electric vehicle battery", description: "" },
];

function demoGstin(stateGst: string, pan: string, entity = "1") {
  const first14 = `${stateGst}${pan}${entity}Z`;
  return first14 + gstinCheckDigit(first14);
}

async function seedCategories() {
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.materialCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, description: c.description, stream: c.stream, sortOrder: i },
      create: { ...c, sortOrder: i },
    });
  }
  console.log(`✓ ${CATEGORIES.length} material categories`);
}

async function seedDemoCompany() {
  const password = await hash("Demo@12345");
  const users: { email: string; name: string; role: Role }[] = [
    { email: "admin@demo.eprflow.in", name: "Asha Admin", role: "ADMIN" },
    { email: "compliance@demo.eprflow.in", name: "Rahul Compliance", role: "COMPLIANCE_MANAGER" },
    { email: "consultant@demo.eprflow.in", name: "Meera Consultant", role: "CONSULTANT" },
    { email: "viewer@demo.eprflow.in", name: "Vikram Viewer", role: "VIEWER" },
  ];

  const pan = "AAACD1234F";
  const org = await prisma.organization.upsert({
    where: { slug: "demo-consumer-goods" },
    update: {},
    create: {
      slug: "demo-consumer-goods",
      name: "Demo Consumer Goods",
      legalName: "Demo Consumer Goods Private Limited",
      entityTypes: ["BRAND_OWNER", "PRODUCER"],
      wasteStreams: ["PLASTIC"],
      pan,
      headOfficeState: "MH",
      cpcbRegistrationNo: "DEMO-PIBO-0001",
      onboardingCompletedAt: new Date(),
      gstRegistrations: {
        create: [
          { gstin: demoGstin("27", pan), stateCode: "MH", legalName: "Demo Consumer Goods Pvt Ltd" },
          { gstin: demoGstin("29", pan), stateCode: "KA", legalName: "Demo Consumer Goods Pvt Ltd" },
          { gstin: demoGstin("09", pan), stateCode: "UP", legalName: "Demo Consumer Goods Pvt Ltd" },
        ],
      },
      brands: { create: [{ name: "FreshBite Snacks" }, { name: "PureGlow Personal Care" }, { name: "HomeShine" }] },
    },
  });

  const ids: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, passwordHash: password, emailVerified: new Date(), lastActiveOrgId: org.id },
    });
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role: u.role },
      create: { organizationId: org.id, userId: user.id, role: u.role },
    });
    ids[u.role] = user.id;
  }

  // Plants are used from phase 2 onwards; seeded now so the demo company looks complete.
  const gsts = await prisma.gstRegistration.findMany({ where: { organizationId: org.id } });
  const plants = [
    { name: "Pune Packaging Unit", stateCode: "MH", city: "Pune" },
    { name: "Bengaluru Filling Plant", stateCode: "KA", city: "Bengaluru" },
    { name: "Noida Distribution Centre", stateCode: "UP", city: "Noida" },
  ];
  for (const p of plants) {
    await prisma.plant.upsert({
      where: { organizationId_name: { organizationId: org.id, name: p.name } },
      update: {},
      create: { ...p, organizationId: org.id, gstRegistrationId: gsts.find((g) => g.stateCode === p.stateCode)?.id },
    });
  }

  console.log(`✓ demo organization "${org.name}" with ${users.length} users, 3 GSTINs, 3 brands, 3 plants`);
  return { org, ids, password };
}

/** A second client so the consultant's org switcher (multi-client view) has something to show. */
async function seedSecondClient(consultantId: string, password: string) {
  const pan = "AABCG5678K";
  const org = await prisma.organization.upsert({
    where: { slug: "greenpack-industries" },
    update: {},
    create: {
      slug: "greenpack-industries",
      name: "GreenPack Industries",
      legalName: "GreenPack Industries Limited",
      entityTypes: ["PRODUCER", "IMPORTER"],
      wasteStreams: ["PLASTIC", "EWASTE"],
      pan,
      headOfficeState: "GJ",
      cpcbRegistrationNo: "DEMO-PIBO-0002",
      onboardingCompletedAt: new Date(),
      gstRegistrations: {
        create: [
          { gstin: demoGstin("24", pan), stateCode: "GJ", legalName: "GreenPack Industries Ltd" },
          { gstin: demoGstin("33", pan), stateCode: "TN", legalName: "GreenPack Industries Ltd" },
        ],
      },
      brands: { create: [{ name: "GreenPack Films" }, { name: "VoltSafe Electronics" }] },
    },
  });
  const owner = await prisma.user.upsert({
    where: { email: "owner@greenpack.example.in" },
    update: {},
    create: { email: "owner@greenpack.example.in", name: "Karan Shah", passwordHash: password, emailVerified: new Date() },
  });
  for (const [userId, role] of [
    [owner.id, "ADMIN"],
    [consultantId, "CONSULTANT"],
  ] as const) {
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId } },
      update: {},
      create: { organizationId: org.id, userId, role },
    });
  }
  console.log(`✓ second client "${org.name}" (consultant sees both companies)`);
  return org;
}

/** A plausible activity history + one pending invite, only on first seed. */
async function seedDemoHistory(orgId: string, ids: Record<string, string>) {
  if ((await prisma.auditLog.count({ where: { organizationId: orgId } })) > 0) return;
  const day = 86_400_000;
  const at = (daysAgo: number, hour = 11) => new Date(Date.now() - daysAgo * day + hour * 3_600_000 - 12 * 3_600_000);
  const meta = { ip: "203.0.113.24", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/141" };
  const entries = [
    { daysAgo: 21, actorId: ids.ADMIN, action: "organization.create", entityType: "Organization", entityId: orgId },
    { daysAgo: 21, actorId: ids.ADMIN, action: "member.invite", entityType: "Invitation", entityId: "seed-inv-1", after: { email: "compliance@demo.eprflow.in", role: "COMPLIANCE_MANAGER" } },
    { daysAgo: 20, actorId: ids.COMPLIANCE_MANAGER, action: "member.join", entityType: "Invitation", entityId: "seed-inv-1" },
    { daysAgo: 18, actorId: ids.ADMIN, action: "member.invite", entityType: "Invitation", entityId: "seed-inv-2", after: { email: "consultant@demo.eprflow.in", role: "CONSULTANT" } },
    { daysAgo: 17, actorId: ids.CONSULTANT, action: "member.join", entityType: "Invitation", entityId: "seed-inv-2" },
    { daysAgo: 12, actorId: ids.ADMIN, action: "organization.update", entityType: "Organization", entityId: orgId, after: { cpcbRegistrationNo: "DEMO-PIBO-0001" } },
    { daysAgo: 9, actorId: ids.ADMIN, action: "member.invite", entityType: "Invitation", entityId: "seed-inv-3", after: { email: "viewer@demo.eprflow.in", role: "COMPLIANCE_MANAGER" } },
    { daysAgo: 8, actorId: ids.VIEWER, action: "member.join", entityType: "Invitation", entityId: "seed-inv-3" },
    { daysAgo: 6, actorId: ids.ADMIN, action: "member.role_change", entityType: "Membership", entityId: "seed-mem-viewer", before: { role: "COMPLIANCE_MANAGER" }, after: { role: "VIEWER" } },
  ];
  await prisma.auditLog.createMany({
    data: entries.map(({ daysAgo, ...e }) => ({ ...e, ...meta, organizationId: orgId, createdAt: at(daysAgo) })),
  });

  // Pending invite (token is random and discarded, so the link can't be used).
  await prisma.invitation.create({
    data: {
      organizationId: orgId,
      email: "finance@demo.eprflow.in",
      role: "VIEWER",
      tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      invitedById: ids.ADMIN,
      expiresAt: new Date(Date.now() + 5 * day),
      createdAt: at(2),
    },
  });
  console.log(`✓ ${entries.length} audit log entries and 1 pending invitation`);
}

/** Monthly placed-on-market data from April 2024 to last month (fills gaps only). */
async function seedMaterialEntries(orgSlug: string, createdById: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: orgSlug },
    include: { brands: true, plants: true, gstRegistrations: true },
  });
  // Fill only months the org has no data for, so re-running the seed never duplicates.
  const existingMonths = new Set(
    (await prisma.materialEntry.findMany({ where: { organizationId: org.id }, select: { periodMonth: true }, distinct: ["periodMonth"] })).map(
      (e) => e.periodMonth.toISOString().slice(0, 7),
    ),
  );

  const cats = Object.fromEntries((await prisma.materialCategory.findMany()).map((c) => [c.code, c.id]));
  const byName = (list: { id: string; name: string }[], name: string) => list.find((x) => x.name === name)?.id ?? null;
  const gstIn = (state: string) => org.gstRegistrations.find((g) => g.stateCode === state)?.id ?? null;

  // brand, plant, state, category, base tonnes per month
  const lines =
    orgSlug === "demo-consumer-goods"
      ? [
          ["FreshBite Snacks", "Pune Packaging Unit", "MH", "PLASTIC_CAT_II", 18],
          ["FreshBite Snacks", "Pune Packaging Unit", "MH", "PLASTIC_CAT_III", 9],
          ["FreshBite Snacks", "Noida Distribution Centre", "UP", "PLASTIC_CAT_II", 7],
          ["PureGlow Personal Care", "Bengaluru Filling Plant", "KA", "PLASTIC_CAT_I", 12],
          ["PureGlow Personal Care", "Bengaluru Filling Plant", "KA", "PLASTIC_CAT_II", 3],
          ["HomeShine", "Pune Packaging Unit", "MH", "PLASTIC_CAT_I", 6],
          ["HomeShine", "Noida Distribution Centre", "UP", "PLASTIC_CAT_I", 4],
        ]
      : [
          ["GreenPack Films", null, "GJ", "PLASTIC_CAT_II", 40],
          ["GreenPack Films", null, "TN", "PLASTIC_CAT_III", 15],
        ];

  const now = new Date();
  const months: Date[] = [];
  for (let d = new Date(Date.UTC(2024, 3, 1)); d < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    if (!existingMonths.has(d.toISOString().slice(0, 7))) months.push(d);
  }
  if (months.length === 0) return;

  const data = months.flatMap((month, i) =>
    lines.map(([brand, plant, state, code, base], j) => {
      // Festive-season peak (Oct–Dec) and a small deterministic wobble per line.
      const m = month.getUTCMonth();
      const season = m >= 9 && m <= 11 ? 1.25 : m >= 3 && m <= 5 ? 0.9 : 1;
      const wobble = 1 + (((i * 7 + j * 13) % 11) - 5) / 50;
      const kg = Math.round((base as number) * 1000 * season * wobble * 1000) / 1000;
      const fyStart = m >= 3 ? month.getUTCFullYear() : month.getUTCFullYear() - 1;
      return {
        organizationId: org.id,
        categoryId: cats[code as string],
        entityType: (orgSlug === "demo-consumer-goods" ? "BRAND_OWNER" : "PRODUCER") as "BRAND_OWNER" | "PRODUCER",
        periodMonth: month,
        financialYear: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`,
        stateCode: state as string,
        brandId: byName(org.brands, brand as string),
        plantId: plant ? byName(org.plants, plant as string) : null,
        gstRegistrationId: gstIn(state as string),
        quantityKg: kg.toFixed(3),
        recycledContentKg: code === "PLASTIC_CAT_I" ? (kg * 0.3).toFixed(3) : null,
        source: "MANUAL" as const,
        createdById,
      };
    }),
  );
  await prisma.materialEntry.createMany({ data });
  console.log(`✓ ${data.length} material entries for ${org.name} (${months.length} months)`);
}

const PLACEHOLDER = "VERIFY WITH LATEST CPCB NOTIFICATION";

/** Regulatory values are placeholders: every rule is seeded unverified and flagged in the UI. */
async function seedRegulationRules() {
  if ((await prisma.regulationRule.count()) > 0) return;
  const cat = Object.fromEntries((await prisma.materialCategory.findMany()).map((c) => [c.code, c.id]));
  const fyStart = (y: number) => new Date(Date.UTC(y, 3, 1));
  const fyLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  const base = { isVerified: false, notes: PLACEHOLDER, version: 1 };
  const eprParams = { baseMethod: "AVERAGE_PREVIOUS_YEARS", lookbackYears: 2, deductPreConsumer: true };
  const rules: Prisma.RegulationRuleCreateManyInput[] = [];

  // Plastic — overall EPR obligation as % of the average of the previous two FYs.
  rules.push(
    { ...base, stream: "PLASTIC", ruleType: "EPR_TARGET", value: 70, unit: "PERCENT", effectiveFrom: fyStart(2022), effectiveTo: fyStart(2023), parameters: eprParams, sourceReference: "PWM Rules — EPR Guidelines 2022, Schedule II (placeholder)" },
    { ...base, stream: "PLASTIC", ruleType: "EPR_TARGET", value: 100, unit: "PERCENT", effectiveFrom: fyStart(2023), parameters: eprParams, sourceReference: "PWM Rules — EPR Guidelines 2022, Schedule II (placeholder)" },
  );
  const recycling: Record<string, number[]> = {
    PLASTIC_CAT_I: [50, 60, 70, 80, 80],
    PLASTIC_CAT_II: [30, 40, 50, 60, 60],
    PLASTIC_CAT_III: [30, 40, 50, 60, 60],
    PLASTIC_CAT_IV: [50, 60, 70, 80, 80],
  };
  const recycledContent: Record<string, number[]> = {
    PLASTIC_CAT_I: [0, 30, 40, 50, 60],
    PLASTIC_CAT_II: [0, 10, 10, 20, 20],
    PLASTIC_CAT_III: [0, 5, 5, 10, 10],
  };
  for (let i = 0; i < 5; i++) {
    const y = 2024 + i;
    const year = { financialYear: fyLabel(y), effectiveFrom: fyStart(y), effectiveTo: fyStart(y + 1), unit: "PERCENT" };
    for (const [code, values] of Object.entries(recycling)) {
      rules.push({ ...base, ...year, stream: "PLASTIC", categoryId: cat[code], ruleType: "RECYCLING_TARGET", value: values[i], sourceReference: "PWM Rules — minimum level of recycling (placeholder)" });
    }
    for (const [code, values] of Object.entries(recycledContent)) {
      if (values[i] > 0) {
        rules.push({ ...base, ...year, stream: "PLASTIC", categoryId: cat[code], ruleType: "RECYCLED_CONTENT", value: values[i], sourceReference: "PWM Rules — mandatory use of recycled plastic (placeholder)" });
      }
    }
  }
  for (const [code, inrPerKg] of Object.entries({ PLASTIC_CAT_I: 5, PLASTIC_CAT_II: 10, PLASTIC_CAT_III: 10, PLASTIC_CAT_IV: 10 })) {
    rules.push({ ...base, stream: "PLASTIC", categoryId: cat[code], ruleType: "EC_RATE", value: inrPerKg, unit: "INR_PER_KG", effectiveFrom: fyStart(2022), sourceReference: "CPCB Environmental Compensation guidelines (placeholder)" });
  }

  // E-waste and batteries — collection targets (placeholders).
  rules.push(
    { ...base, stream: "EWASTE", ruleType: "EPR_TARGET", value: 70, unit: "PERCENT", effectiveFrom: fyStart(2023), parameters: { baseMethod: "AVERAGE_PREVIOUS_YEARS", lookbackYears: 1 }, sourceReference: "E-Waste (Management) Rules 2022, Schedule III (placeholder)" },
    { ...base, stream: "EWASTE", ruleType: "EC_RATE", value: 15, unit: "INR_PER_KG", effectiveFrom: fyStart(2023), sourceReference: "Placeholder" },
    { ...base, stream: "BATTERY", ruleType: "EPR_TARGET", value: 70, unit: "PERCENT", effectiveFrom: fyStart(2023), parameters: { baseMethod: "AVERAGE_PREVIOUS_YEARS", lookbackYears: 3 }, sourceReference: "Battery Waste Management Rules 2022 (placeholder)" },
    { ...base, stream: "BATTERY", ruleType: "EC_RATE", value: 20, unit: "INR_PER_KG", effectiveFrom: fyStart(2023), sourceReference: "Placeholder" },
  );

  await prisma.regulationRule.createMany({ data: rules });
  console.log(`✓ ${rules.length} regulation rules (placeholders — ${PLACEHOLDER})`);
}

/**
 * Filing deadlines per waste stream (placeholders). Dates are relative to the FY:
 * yearOffset 1 + 30 June = "30 June after the financial year ends".
 * Upgrades the older `{ annualReturnDue }` rule in place when re-seeding an existing database.
 */
const FILING_DEADLINES: Record<WasteStream, { key: string; title: string; description: string; month: number; day: number; yearOffset: number }[]> = {
  PLASTIC: [
    { key: "epr-fulfilment", title: "EPR target fulfilment", description: "The year's EPR obligation must be covered by EPR certificates by the end of the financial year.", month: 3, day: 31, yearOffset: 1 },
    { key: "annual-return", title: "Annual return", description: "File the PIBO annual return on the CPCB centralised EPR portal for the year just ended.", month: 6, day: 30, yearOffset: 1 },
  ],
  EWASTE: [
    { key: "epr-fulfilment", title: "EPR target fulfilment", description: "Cover the year's e-waste EPR target with certificates by the end of the financial year.", month: 3, day: 31, yearOffset: 1 },
    { key: "annual-return", title: "Annual return", description: "File the producer annual return on the CPCB e-waste EPR portal.", month: 6, day: 30, yearOffset: 1 },
  ],
  BATTERY: [
    { key: "annual-return", title: "Annual return", description: "File the producer annual return on the CPCB battery EPR portal.", month: 6, day: 30, yearOffset: 1 },
  ],
};

async function seedFilingDeadlineRules() {
  const fyStart = (y: number) => new Date(Date.UTC(y, 3, 1));
  let changed = 0;
  for (const stream of Object.keys(FILING_DEADLINES) as WasteStream[]) {
    const parameters = { deadlines: FILING_DEADLINES[stream] };
    const existing = await prisma.regulationRule.findFirst({ where: { stream, ruleType: "FILING_DEADLINE" }, orderBy: { version: "desc" } });
    if (existing && (existing.parameters as { deadlines?: unknown } | null)?.deadlines) continue;
    if (existing) {
      await prisma.regulationRule.update({ where: { id: existing.id }, data: { parameters } });
    } else {
      await prisma.regulationRule.create({
        data: { stream, ruleType: "FILING_DEADLINE", value: 0, unit: "DATE", effectiveFrom: fyStart(2022), parameters, isVerified: false, version: 1, notes: PLACEHOLDER, sourceReference: "CPCB EPR portal filing calendar (placeholder)" },
      });
    }
    changed++;
  }
  if (changed) console.log(`✓ filing-deadline rules for ${changed} waste stream(s) (placeholders — ${PLACEHOLDER})`);
}

/** A few internal deadlines so the demo calendar is not only statutory dates. Dates are relative to today. */
async function seedDeadlines(orgSlug: string, userId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  if (await prisma.deadline.count({ where: { organizationId: org.id, ruleId: null } })) return;
  const today = new Date();
  const day = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  await prisma.deadline.createMany({
    data: [
      { organizationId: org.id, title: "Board review of EPR certificate purchases", description: "Approve the Q3 certificate budget for Cat II and Cat III shortfalls.", dueDate: day(5), reminderDays: [7, 1], createdById: userId },
      { organizationId: org.id, title: "Collect Q3 dispatch data from all plants", description: "Pune, Bengaluru and Noida plants to share monthly packaging dispatch.", dueDate: day(24), reminderDays: [14, 3], createdById: userId },
      { organizationId: org.id, title: "Recycler due-diligence visit — PWP-MH-0412", dueDate: day(48), reminderDays: [30, 7], createdById: userId },
      { organizationId: org.id, title: "Upload Q2 material data", dueDate: day(-12), status: "DONE", completedAt: day(-14), completedById: userId, createdById: userId },
    ],
  });
  console.log("✓ demo calendar deadlines (statutory dates are generated by the app)");
}

/**
 * The demo company has already filed last year's returns: record the previous FY's
 * statutory deadlines that are past as done (same keys the app generates, so nothing duplicates).
 */
async function seedFiledReturns(orgSlug: string, userId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  const previousFy = formatFinancialYear(parseFinancialYear(financialYearOf(new Date())).startYear - 1);
  const rules = await prisma.regulationRule.findMany({ where: { ruleType: "FILING_DEADLINE" } });
  const deadlines = buildStatutoryDeadlines({
    streams: org.wasteStreams,
    financialYears: [previousFy],
    rules: rules.map((r) => ({ ...r, value: Number(r.value), parameters: (r.parameters as Record<string, unknown> | null) ?? null })),
  }).filter((d) => d.dueDate < new Date());
  for (const d of deadlines) {
    const completedAt = new Date(d.dueDate.getTime() - 4 * 86_400_000);
    const done = { status: "DONE" as const, completedAt, completedById: userId };
    await prisma.deadline.upsert({
      where: { organizationId_dedupeKey: { organizationId: org.id, dedupeKey: d.dedupeKey } },
      create: { organizationId: org.id, dedupeKey: d.dedupeKey, title: d.title, description: d.description, dueDate: d.dueDate, financialYear: d.financialYear, stream: d.stream as WasteStream, ruleId: d.ruleId, ...done },
      update: done,
    });
  }
  if (deadlines.length) console.log(`✓ ${deadlines.length} FY ${previousFy} filing(s) recorded as done`);
}

async function seedPlatformAdmin(password: string) {
  await prisma.user.upsert({
    where: { email: "ops@eprflow.in" },
    update: { isPlatformAdmin: true },
    create: { email: "ops@eprflow.in", name: "EPRFlow Ops", passwordHash: password, emailVerified: new Date(), isPlatformAdmin: true },
  });
  console.log("✓ platform admin ops@eprflow.in");
}

/** Platform-wide verified recyclers with annual capacity per category. */
async function seedRecyclers() {
  const cat = Object.fromEntries((await prisma.materialCategory.findMany()).map((c) => [c.code, c.id]));
  const recyclers = [
    { name: "Shree Polymers Recycling Pvt Ltd", cpcbRegistrationNo: "PWP-MH-0412", stateCode: "MH", city: "Bhiwandi", caps: { PLASTIC_CAT_I: 900, PLASTIC_CAT_II: 600 } },
    { name: "GreenLoop Plastics LLP", cpcbRegistrationNo: "PWP-KA-0177", stateCode: "KA", city: "Hosur Road", caps: { PLASTIC_CAT_II: 700, PLASTIC_CAT_III: 400 } },
    { name: "Eastern Cement Co-processing Ltd", cpcbRegistrationNo: "PWP-WB-0031", stateCode: "WB", city: "Durgapur", caps: { PLASTIC_CAT_I: 500, PLASTIC_CAT_II: 800, PLASTIC_CAT_III: 1500 } },
  ];
  const ids: Record<string, string> = {};
  for (const r of recyclers) {
    const existing = await prisma.recycler.findFirst({ where: { cpcbRegistrationNo: r.cpcbRegistrationNo, organizationId: null } });
    const rec =
      existing ??
      (await prisma.recycler.create({
        data: {
          name: r.name,
          cpcbRegistrationNo: r.cpcbRegistrationNo,
          stateCode: r.stateCode,
          city: r.city,
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          registrationValidFrom: new Date(Date.UTC(2023, 3, 1)),
          registrationValidTo: new Date(Date.UTC(2028, 2, 31)),
        },
      }));
    ids[r.cpcbRegistrationNo] = rec.id;
    for (const fy of ["2025-26", "2026-27"]) {
      for (const [code, tonnes] of Object.entries(r.caps)) {
        await prisma.recyclerCapacity.upsert({
          where: { recyclerId_categoryId_financialYear: { recyclerId: rec.id, categoryId: cat[code], financialYear: fy } },
          update: {},
          create: { recyclerId: rec.id, categoryId: cat[code], financialYear: fy, annualCapacityKg: tonnes * 1000 },
        });
      }
    }
  }
  console.log(`✓ ${recyclers.length} verified recyclers`);
  return ids;
}

/**
 * Approved certificates sized against the demo company's real targets so the dashboard
 * tells a story: FY 2025-26 closed with one small shortfall, FY 2026-27 with mixed progress.
 */
async function seedCertificates(orgSlug: string, recyclers: Record<string, string>, userId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  if ((await prisma.certificate.count({ where: { organizationId: org.id } })) > 0) return;
  const cat = Object.fromEntries((await prisma.materialCategory.findMany()).map((c) => [c.code, c.id]));

  // Target = average of the two previous FYs at a 100% EPR target, excluding pre-consumer.
  async function target(code: string, fy: string) {
    const start = Number(fy.slice(0, 4));
    const years = [start - 2, start - 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
    const agg = await prisma.materialEntry.aggregate({
      where: { organizationId: org.id, categoryId: cat[code], financialYear: { in: years }, isPreConsumer: false, deletedAt: null },
      _sum: { quantityKg: true },
    });
    return Number(agg._sum.quantityKg ?? 0) / 2;
  }

  // [fy, category, share of target, recycler, type, INR/kg, issue date]
  const plan: [string, string, number, string, "RECYCLING" | "END_OF_LIFE", number, string][] = [
    ["2025-26", "PLASTIC_CAT_I", 0.75, "PWP-MH-0412", "RECYCLING", 9.5, "2025-12-15"],
    ["2025-26", "PLASTIC_CAT_I", 0.3, "PWP-WB-0031", "END_OF_LIFE", 4.2, "2026-02-10"],
    ["2025-26", "PLASTIC_CAT_II", 0.55, "PWP-KA-0177", "RECYCLING", 12, "2026-01-20"],
    ["2025-26", "PLASTIC_CAT_II", 0.4, "PWP-WB-0031", "END_OF_LIFE", 4.5, "2026-03-05"],
    ["2025-26", "PLASTIC_CAT_III", 0.45, "PWP-KA-0177", "RECYCLING", 14, "2026-02-25"],
    ["2025-26", "PLASTIC_CAT_III", 0.45, "PWP-WB-0031", "END_OF_LIFE", 5, "2026-03-20"],
    ["2026-27", "PLASTIC_CAT_I", 0.42, "PWP-MH-0412", "RECYCLING", 10, "2026-07-18"],
    ["2026-27", "PLASTIC_CAT_I", 0.12, "PWP-WB-0031", "END_OF_LIFE", 4.4, "2026-09-02"],
    ["2026-27", "PLASTIC_CAT_II", 0.2, "PWP-KA-0177", "RECYCLING", 12.5, "2026-08-11"],
    ["2026-27", "PLASTIC_CAT_III", 0.08, "PWP-KA-0177", "RECYCLING", 14.5, "2026-09-24"],
  ];
  let n = 0;
  for (const [fy, code, share, reg, type, inrPerKg, issued] of plan) {
    const qty = Math.round((await target(code, fy)) * share);
    if (qty <= 0) continue;
    n++;
    const number = `${reg.replace("PWP-", "EPR/")}/${fy.slice(0, 4)}/${String(1000 + n * 37).padStart(6, "0")}`;
    const date = new Date(`${issued}T00:00:00Z`);
    await prisma.certificate.create({
      data: {
        organizationId: org.id,
        recyclerId: recyclers[reg],
        categoryId: cat[code],
        type,
        certificateNumber: number,
        certificateNumberNormalized: number.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        financialYear: fy,
        quantityKg: qty,
        issueDate: date,
        transferDate: date,
        costInr: Math.round(qty * inrPerKg),
        pricePerKgInr: inrPerKg,
        status: "APPROVED",
        createdById: userId,
        approvedById: userId,
        approvedAt: date,
      },
    });
  }
  for (const [fy, amountInr] of [["2025-26", 4_000_000], ["2026-27", 4_500_000]] as const) {
    const existing = await prisma.budget.findFirst({ where: { organizationId: org.id, financialYear: fy, categoryId: null } });
    if (!existing) await prisma.budget.create({ data: { organizationId: org.id, financialYear: fy, amountInr } });
  }
  console.log(`✓ ${n} approved certificates and FY budgets for ${org.name}`);
}

async function main() {
  await seedCategories();
  const { org, ids, password } = await seedDemoCompany();
  await seedSecondClient(ids.CONSULTANT, password);
  await seedDemoHistory(org.id, ids);
  await seedMaterialEntries("demo-consumer-goods", ids.COMPLIANCE_MANAGER);
  await seedMaterialEntries("greenpack-industries", ids.CONSULTANT);
  await seedRegulationRules();
  await seedFilingDeadlineRules();
  await seedDeadlines("demo-consumer-goods", ids.COMPLIANCE_MANAGER);
  await seedFiledReturns("demo-consumer-goods", ids.COMPLIANCE_MANAGER);
  await seedPlatformAdmin(password);
  const recyclers = await seedRecyclers();
  await seedCertificates("demo-consumer-goods", recyclers, ids.ADMIN);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
