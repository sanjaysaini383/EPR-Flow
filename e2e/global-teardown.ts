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
    await client.query(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%' OR key LIKE 'signup:%' OR key LIKE 'invite%'`);
  } finally {
    await client.end();
  }
}
