import "server-only";
import { headers } from "next/headers";

/** Client IP as reported by Vercel's edge (x-forwarded-for first hop), or "unknown" locally. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

export async function getRequestMeta() {
  const h = await headers();
  return {
    ip: await getClientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}
