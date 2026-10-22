import type { ExtractionTarget } from "./prompts";
import type { CertificateExtraction, InvoiceExtraction } from "./schemas";

export type { ExtractionTarget };

export type ExtractionOutput =
  | { target: "CERTIFICATE"; data: CertificateExtraction }
  | { target: "MATERIAL_ENTRY"; data: InvoiceExtraction };

export type ExtractionResult = ExtractionOutput & { model: string; inputTokens: number | null; outputTokens: number | null };

/** A failure with a message that is safe and useful to show the reviewer. */
export class ExtractionError extends Error {}

export interface ExtractionProvider {
  readonly name: "claude" | "gemini" | "fake";
  extract(input: { bytes: Uint8Array; mimeType: string; target: ExtractionTarget }): Promise<ExtractionResult>;
}
