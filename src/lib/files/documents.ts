import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { TenantDb } from "@/lib/db/tenant";
import { getStorage } from "@/lib/storage";
import { checkDocument, safeFileName, type DocumentType } from "./sniff";

type Kind = "CERTIFICATE_PDF" | "INVOICE" | "OTHER";

/**
 * Stores an uploaded document for the organisation: checks its real type and size,
 * fingerprints it (SHA-256, used for duplicate detection) and writes it to storage.
 * The StoredFile row is created first so the database driver can reference it; if the
 * write fails the row is removed again.
 */
export async function storeDocument(
  db: TenantDb,
  input: { organizationId: string; userId: string; file: File; kind: Kind; allowed: DocumentType["mime"][] },
) {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const type = checkDocument(bytes, input.allowed);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileName = safeFileName(input.file.name, type.ext);
  const key = `org/${input.organizationId}/${input.kind.toLowerCase()}/${randomUUID()}.${type.ext}`;

  const storage = getStorage();
  const row = await db.storedFile.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      storageKey: `pending:${key}`,
      fileName,
      mimeType: type.mime,
      sizeBytes: bytes.byteLength,
      sha256,
      uploadedById: input.userId,
    },
  });
  try {
    const storageKey = await storage.put(key, bytes, type.mime, row.id);
    return await db.storedFile.update({ where: { id: row.id }, data: { storageKey } });
  } catch (error) {
    await db.storedFile.delete({ where: { id: row.id } }).catch(() => {});
    throw error;
  }
}
