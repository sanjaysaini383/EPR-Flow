import "server-only";
import { del, get, put } from "@vercel/blob";
import { prisma } from "@/lib/db/client";

/**
 * File storage behind one interface. Drivers:
 *   - "blob": Vercel Blob, private access (files are never publicly reachable;
 *     they are streamed through /api/files/[id] after an access check).
 *   - "database": bytes in Postgres (StoredFileContent). Used for local development
 *     and tests, or a deployment without Blob. Fine for PDFs of a few MB.
 * With STORAGE_DRIVER=blob but no BLOB_READ_WRITE_TOKEN, development falls back to
 * the database driver; production refuses so files never land somewhere unexpected.
 */
export interface StorageAdapter {
  readonly name: "blob" | "database";
  put(key: string, bytes: Uint8Array, contentType: string, fileId: string): Promise<string>;
  get(storageKey: string, fileId: string): Promise<Uint8Array | null>;
  remove(storageKey: string, fileId: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured. Set BLOB_READ_WRITE_TOKEN (Vercel Blob) or STORAGE_DRIVER=database.");
  }
}

const blobDriver: StorageAdapter = {
  name: "blob",
  async put(key, bytes, contentType) {
    const result = await put(key, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: true });
    return result.pathname;
  },
  async get(storageKey) {
    const result = await get(storageKey, { access: "private" });
    if (!result) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  async remove(storageKey) {
    await del(storageKey);
  },
};

const databaseDriver: StorageAdapter = {
  name: "database",
  async put(key, bytes, _contentType, fileId) {
    await prisma.storedFileContent.create({ data: { fileId, bytes: Buffer.from(bytes) } });
    return `db:${key}`;
  },
  async get(_storageKey, fileId) {
    const row = await prisma.storedFileContent.findUnique({ where: { fileId } });
    return row ? new Uint8Array(row.bytes) : null;
  },
  async remove(_storageKey, fileId) {
    await prisma.storedFileContent.deleteMany({ where: { fileId } });
  },
};

let warned = false;

export function getStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "blob").trim();
  if (driver === "database") return databaseDriver;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobDriver;
  if (process.env.NODE_ENV === "production") throw new StorageNotConfiguredError();
  if (!warned) {
    console.warn("[storage] BLOB_READ_WRITE_TOKEN is not set — storing files in Postgres for development.");
    warned = true;
  }
  return databaseDriver;
}

/** Reads a stored file with the driver it was written by (keys from the database driver start with "db:"). */
export function storageFor(storageKey: string): StorageAdapter {
  return storageKey.startsWith("db:") ? databaseDriver : blobDriver;
}
