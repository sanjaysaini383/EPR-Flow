import { getOrgContext } from "@/lib/auth/session";
import { storageFor } from "@/lib/storage";

const ID = /^[a-z0-9]{10,40}$/i;

/**
 * Streams a stored document to members of the owning organisation only. Files of
 * other organisations are indistinguishable from missing ones (404).
 */
export async function GET(request: Request, { params }: RouteContext<"/o/[orgSlug]/files/[fileId]">) {
  const { orgSlug, fileId } = await params;
  if (!ID.test(fileId)) return new Response("Not found", { status: 404 });
  const { db } = await getOrgContext(orgSlug);

  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.storageKey.startsWith("pending:")) return new Response("Not found", { status: 404 });

  const bytes = await storageFor(file.storageKey).get(file.storageKey, file.id);
  if (!bytes) return new Response("The file is no longer available.", { status: 410 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(bytes as BodyInit, {
    headers: {
      // The type was detected from the file's bytes at upload, so it is safe to serve as-is.
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
