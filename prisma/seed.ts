import "dotenv/config";
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
  }
  console.log(`✓ demo organization "${org.name}" with ${users.length} users (password: Demo@12345)`);
}

async function main() {
  await seedCategories();
  await seedDemoCompany();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
