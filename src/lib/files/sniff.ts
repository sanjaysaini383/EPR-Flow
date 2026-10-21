/**
 * Identifies uploaded documents by their leading bytes ("magic numbers"), never by
 * the file name or the browser-supplied type, so a renamed HTML or executable file
 * cannot be stored and later served as a "PDF".
 */

export type DocumentType = { mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; ext: "pdf" | "png" | "jpg" | "webp" };

// Vercel functions accept request bodies up to 4.5 MB, so documents are capped at 4 MB.
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

export function sniffDocument(bytes: Uint8Array): DocumentType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" }; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}

export class DocumentError extends Error {}

/** Validates an uploaded document; returns its detected type or throws a user-readable DocumentError. */
export function checkDocument(bytes: Uint8Array, allowed: DocumentType["mime"][]): DocumentType {
  if (bytes.byteLength === 0) throw new DocumentError("The file is empty.");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentError(`The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`);
  const type = sniffDocument(bytes);
  if (!type || !allowed.includes(type.mime)) {
    const names = allowed.map((m) => (m === "application/pdf" ? "PDF" : m.replace("image/", "").toUpperCase()));
    throw new DocumentError(`Upload a ${names.join(", ").replace(/, ([^,]*)$/, " or $1")} file. This file's contents are not a supported document.`);
  }
  return type;
}

/** File name safe for storage keys and Content-Disposition headers. */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "document"}.${ext}`;
}
