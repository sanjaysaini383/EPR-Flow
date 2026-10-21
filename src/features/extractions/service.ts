import "server-only";
import { randomUUID } from "node:crypto";
import { ExtractionError, getExtractionProvider } from "@/lib/ai/extract";
import type { TenantDb } from "@/lib/db/tenant";
import { storageFor } from "@/lib/storage";

/** A run still "processing" after this long has died with its function (timeout) and can be retried. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export const NOT_CONFIGURED = "AI extraction is not set up on this server (ANTHROPIC_API_KEY is missing). You can still enter the details by hand below.";

export function isStale(e: { status: string; updatedAt: Date }, now = new Date()) {
  return (e.status === "PROCESSING" || e.status === "QUEUED") && now.getTime() - e.updatedAt.getTime() > STALE_AFTER_MS;
}

/**
 * Runs one extraction: claims it (QUEUED → PROCESSING, so two runs never overlap),
 * sends the document to Claude and stores the validated result for human review.
 * Never throws — failures are recorded on the extraction with a readable message.
 */
export async function runExtraction(db: TenantDb, extractionId: string) {
  const claimed = await db.extraction.updateMany({ where: { id: extractionId, status: "QUEUED" }, data: { status: "PROCESSING", error: null } });
  if (claimed.count === 0) return;

  const fail = (error: string) => db.extraction.update({ where: { id: extractionId }, data: { status: "FAILED", error } });
  try {
    const provider = getExtractionProvider();
    if (!provider) return void (await fail(NOT_CONFIGURED));

    const extraction = await db.extraction.findUniqueOrThrow({ where: { id: extractionId }, include: { file: true } });
    const bytes = await storageFor(extraction.file.storageKey).get(extraction.file.storageKey, extraction.file.id);
    if (!bytes) return void (await fail("The uploaded file is no longer available. Upload it again."));

    const result = await provider.extract({ bytes, mimeType: extraction.file.mimeType, target: extraction.target });
    await db.extraction.update({
      where: { id: extractionId },
      data: {
        status: "NEEDS_REVIEW",
        model: result.model,
        extracted: result.data as never,
        confidence: result.data.confidence as never,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        error: null,
      },
    });
  } catch (error) {
    if (error instanceof ExtractionError) return void (await fail(error.message));
    const ref = randomUUID().slice(0, 8);
    console.error(`[extraction:${ref}] ${extractionId} failed`, error);
    await fail(`Extraction failed unexpectedly (ref ${ref}). Try again, or enter the details by hand.`).catch(() => {});
  }
}
