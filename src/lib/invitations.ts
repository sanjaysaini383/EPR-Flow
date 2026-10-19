import "server-only";
import { createHash } from "node:crypto";

export const INVITE_TTL_DAYS = 7;

/** Only the hash is stored, so a database leak does not expose usable invite links. */
export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
