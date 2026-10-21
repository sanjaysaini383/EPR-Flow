import "dotenv/config";
import { Client } from "pg";

/** Removes users, organizations and rate-limit rows created by the e2e run so the dev database stays clean. */
export default async function globalTeardown() {
  const client = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      DELETE FROM "Organization" WHERE id IN (
        SELECT m."organizationId" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
        WHERE u.email LIKE 'e2e-%@example.com'
      )`);
    await client.query(`DELETE FROM "User" WHERE email LIKE 'e2e-%@example.com'`);
    await client.query(`DELETE FROM "Invitation" WHERE email LIKE 'invitee-%@example.com'`);
    await client.query(`DELETE FROM "MaterialEntry" WHERE notes = 'e2e-test'`);
    await client.query(`DELETE FROM "ImportBatch" WHERE "fileName" LIKE 'e2e-%' OR "fileName" = 'evil.xlsx'`);
    await client.query(`DELETE FROM "Brand" WHERE name LIKE 'E2E Brand %'`);
    await client.query(`DELETE FROM "Plant" WHERE name LIKE 'E2E Plant %'`);
    await client.query(`DELETE FROM "RegulationRule" WHERE notes = 'e2e-test'`);
    await client.query(`DELETE FROM "Deadline" WHERE title LIKE 'E2E filing check %'`);
    const e2eExtractions = `SELECT e.id FROM "Extraction" e JOIN "StoredFile" f ON f.id = e."fileId" WHERE f."fileName" LIKE 'e2e-%'`;
    await client.query(`DELETE FROM "MaterialEntry" WHERE "extractionId" IN (${e2eExtractions})`);
    await client.query(`DELETE FROM "Certificate" WHERE "extractionId" IN (${e2eExtractions})`);
    await client.query(`DELETE FROM "Extraction" WHERE id IN (${e2eExtractions})`);
    await client.query(`DELETE FROM "StoredFile" f WHERE f."fileName" LIKE 'e2e-%' AND NOT EXISTS (SELECT 1 FROM "Certificate" c WHERE c."fileId" = f.id)`);
    await client.query(`DELETE FROM "Certificate" WHERE "certificateNumber" LIKE 'E2E-%'`);
    await client.query(`DELETE FROM "StoredFile" WHERE kind = 'CERTIFICATE_PDF' AND "fileName" = 'certificate.pdf' AND NOT EXISTS (SELECT 1 FROM "Certificate" c WHERE c."fileId" = "StoredFile".id)`);
    await client.query(`DELETE FROM "Recycler" WHERE name LIKE 'E2E Recycler %'`);
    await client.query(`DELETE FROM "AuditLog" WHERE "organizationId" IS NULL AND action = 'rule.new_version' AND "actorId" = (SELECT id FROM "User" WHERE email = 'ops@eprflow.in')`);
    await client.query(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%' OR key LIKE 'signup:%' OR key LIKE 'invite%' OR key LIKE 'import%' OR key LIKE 'report:%' OR key LIKE 'extract:%'`);
  } finally {
    await client.end();
  }
}
