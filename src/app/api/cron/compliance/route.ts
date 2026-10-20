import { timingSafeEqual } from "node:crypto";
import { recalculateAllOrganizations } from "@/lib/jobs/compliance";

export const maxDuration = 300;

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const authorised =
    !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!authorised) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await recalculateAllOrganizations();
  return Response.json(result);
}
