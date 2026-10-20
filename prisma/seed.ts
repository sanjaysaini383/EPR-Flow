import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role, type WasteStream } from "../src/generated/prisma/client";
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

async function main() {
  await seedCategories();
  const { org, ids, password } = await seedDemoCompany();
  await seedSecondClient(ids.CONSULTANT, password);
  await seedDemoHistory(org.id, ids);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
