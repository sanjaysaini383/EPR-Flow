import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { certificateExtractionSchema, invoiceExtractionSchema, type CertificateExtraction, type InvoiceExtraction } from "./schemas";

export type ExtractionTarget = "CERTIFICATE" | "MATERIAL_ENTRY";
export type ExtractionOutput =
  | { target: "CERTIFICATE"; data: CertificateExtraction }
  | { target: "MATERIAL_ENTRY"; data: InvoiceExtraction };
export type ExtractionResult = ExtractionOutput & { model: string; inputTokens: number | null; outputTokens: number | null };

export class ExtractionError extends Error {}

/** Default model for extraction; override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-opus-5-5";

export interface ExtractionProvider {
  readonly name: string;
  extract(input: { bytes: Uint8Array; mimeType: string; target: ExtractionTarget }): Promise<ExtractionResult>;
}

const SYSTEM = `You read documents for an Indian EPR (Extended Producer Responsibility) compliance team: EPR certificates issued by registered plastic waste processors under the Plastic Waste Management Rules 2022, and invoices for plastic packaging or packaged goods.

Extract only what is printed on the document. When a value is missing, illegible or ambiguous, return null and lower its confidence — never infer or invent numbers, dates or registration numbers. Convert tonnes/MT to kilograms. Dates as YYYY-MM-DD (Indian documents usually print day first). Mention anything suspicious (overwritten figures, missing signature or stamp, totals that do not match) in warnings.`;

const PROMPT: Record<ExtractionTarget, string> = {
  CERTIFICATE: "Extract the EPR certificate details from this document.",
  MATERIAL_ENTRY: "Extract the invoice header and every line item that is plastic packaging or packaged goods from this document.",
};

function claudeProvider(): ExtractionProvider {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: "claude",
    async extract({ bytes, mimeType, target }) {
      const data = Buffer.from(bytes).toString("base64");
      const document: Anthropic.Beta.BetaContentBlockParam =
        mimeType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
          : { type: "image", source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/webp", data } };
      const format = target === "CERTIFICATE" ? betaZodOutputFormat(certificateExtractionSchema) : betaZodOutputFormat(invoiceExtractionSchema);

      let response;
      try {
        response = await client.beta.messages.parse({
          model,
          max_tokens: 16000,
          // On a safety decline, the API retries on a suitable fallback model within the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          output_config: { effort: "medium", format },
          messages: [{ role: "user", content: [document, { type: "text", text: PROMPT[target] }] }],
        });
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) throw new ExtractionError("The Claude API key is invalid. Check ANTHROPIC_API_KEY.");
        if (error instanceof Anthropic.RateLimitError) throw new ExtractionError("The AI service is busy. Try again in a minute.");
        if (error instanceof Anthropic.BadRequestError) throw new ExtractionError("The document could not be read (it may be encrypted, corrupted or too large).");
        if (error instanceof Anthropic.APIError) throw new ExtractionError(`The AI service returned an error (${error.status}). Try again later.`);
        throw error;
      }

      if (response.stop_reason === "refusal") throw new ExtractionError("The AI declined to read this document. Enter the details manually.");
      if (response.stop_reason === "max_tokens") throw new ExtractionError("The document is too long to extract in one go. Enter the details manually or upload fewer pages.");
      const parsed = response.parsed_output;
      if (!parsed) throw new ExtractionError("The AI response could not be understood. Try again or enter the details manually.");

      const usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      return target === "CERTIFICATE"
        ? { target, data: certificateExtractionSchema.parse(parsed), ...usage }
        : { target, data: invoiceExtractionSchema.parse(parsed), ...usage };
    },
  };
}

/**
 * Deterministic stand-in for local demos and end-to-end tests (AI_PROVIDER=fake).
 * Ignored in production builds, so it can never replace real extraction there.
 */
function fakeProvider(): ExtractionProvider {
  return {
    name: "fake",
    async extract({ target }) {
      await new Promise((r) => setTimeout(r, 800));
      const usage = { model: "fake-extractor", inputTokens: 0, outputTokens: 0 };
      if (target === "CERTIFICATE") {
        return {
          target,
          data: {
            certificateNumber: "EPR/KA-0177/2026/000519",
            recyclerName: "GreenLoop Plastics LLP",
            recyclerRegistrationNo: "PWP-KA-0177",
            category: "Category II",
            certificateType: "RECYCLING",
            quantityKg: 18_500,
            issueDate: "2026-10-02",
            transferDate: null,
            financialYear: "2026-27",
            confidence: { certificateNumber: 0.97, recyclerName: 0.95, recyclerRegistrationNo: 0.93, category: 0.9, certificateType: 0.88, quantityKg: 0.62, issueDate: 0.94, transferDate: 0.3, financialYear: 0.9 },
            warnings: ["The quantity appears to have been overwritten by hand — check it against the CPCB portal."],
          },
          ...usage,
        };
      }
      return {
        target,
        data: {
          invoiceNumber: "PK/2026/0917",
          invoiceDate: "2026-09-14",
          sellerName: "Demo Consumer Goods Pvt Ltd",
          sellerGstin: null,
          buyerName: "Metro Retail Distributors",
          buyerGstin: "29AAGCM4321Q1Z8",
          placeOfSupply: "Karnataka",
          lines: [
            { description: "FreshBite chips 50 g — laminated pouches", packagingCategory: "Category III", quantity: 120_000, unit: "pcs", weightKg: 540, confidence: 0.86 },
            { description: "HDPE bottles 500 ml (HomeShine)", packagingCategory: "Category I", quantity: 20_000, unit: "pcs", weightKg: 600, confidence: 0.91 },
            { description: "LDPE shrink film", packagingCategory: "Category II", quantity: 0.35, unit: "MT", weightKg: 350, confidence: 0.58 },
          ],
          confidence: { invoiceNumber: 0.98, invoiceDate: 0.95, sellerGstin: 0.2, buyerGstin: 0.92, placeOfSupply: 0.9 },
          warnings: ["Seller GSTIN not printed; state taken from place of supply."],
        },
        ...usage,
      };
    },
  };
}

/** The configured provider, or null when AI extraction is not set up. */
export function getExtractionProvider(): ExtractionProvider | null {
  if (process.env.NODE_ENV !== "production" && process.env.AI_PROVIDER === "fake") return fakeProvider();
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return claudeProvider();
  return null;
}
