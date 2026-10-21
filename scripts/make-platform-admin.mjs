/**
 * Grants EPRFlow platform-admin rights (edit regulation rules, verify recyclers) to an
 * existing user. Run once per admin after they have signed up:
 *
 *   node scripts/make-platform-admin.mjs ops@yourcompany.in
 *   node scripts/make-platform-admin.mjs ops@yourcompany.in --revoke
 *
 * Uses DIRECT_URL (or DATABASE_URL) from .env / the environment.
 */
import "dotenv/config";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: node scripts/make-platform-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query(`UPDATE "User" SET "isPlatformAdmin" = $1 WHERE lower(email) = $2`, [!revoke, email]);
  if (!rowCount) {
    console.error(`No user with email ${email}. Ask them to sign up first.`);
    process.exitCode = 1;
  } else {
    console.log(`${revoke ? "Revoked" : "Granted"} platform admin for ${email}.`);
  }
} finally {
  await client.end();
}
