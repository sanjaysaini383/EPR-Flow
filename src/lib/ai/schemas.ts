import { z } from "zod";

/**
 * Shapes Claude must return (structured outputs). Every field is nullable: the model
 * reports null rather than guessing when a value is not on the document. Confidence is
 * 0–1 per field and drives which fields the reviewer is asked to check.
 */

const confidence = z.number().describe("0 to 1 — how sure you are the value is printed on the document exactly like this");

export const certificateExtractionSchema = z.object({
  certificateNumber: z.string().nullable().describe("Certificate / EPR certificate number exactly as printed"),
  recyclerName: z.string().nullable().describe("Name of the registered recycler, co-processor or processor that issued it"),
  recyclerRegistrationNo: z.string().nullable().describe("The recycler's CPCB / SPCB registration number, if printed"),
  category: z.string().nullable().describe('Plastic packaging category as printed, e.g. "Category II" or "Cat I"; for e-waste or batteries, the category printed'),
  certificateType: z.enum(["RECYCLING", "END_OF_LIFE"]).nullable().describe("RECYCLING for recycling certificates; END_OF_LIFE for co-processing, waste-to-energy, waste-to-oil or similar"),
  quantityKg: z.number().nullable().describe("Certified quantity converted to kilograms (1 tonne = 1000 kg)"),
  issueDate: z.string().nullable().describe("Issue / generation date as YYYY-MM-DD"),
  transferDate: z.string().nullable().describe("Date transferred to the buyer as YYYY-MM-DD, if printed"),
  financialYear: z.string().nullable().describe('Financial year the certificate is for, as "2025-26", if printed'),
  confidence: z.object({
    certificateNumber: confidence,
    recyclerName: confidence,
    recyclerRegistrationNo: confidence,
    category: confidence,
    certificateType: confidence,
    quantityKg: confidence,
    issueDate: confidence,
    transferDate: confidence,
    financialYear: confidence,
  }),
  warnings: z.array(z.string()).describe("Anything a reviewer should know: illegible text, handwritten edits, missing stamps, numbers that do not add up"),
});

export const invoiceExtractionSchema = z.object({
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("YYYY-MM-DD"),
  sellerName: z.string().nullable(),
  sellerGstin: z.string().nullable().describe("15-character GSTIN of the seller, if printed"),
  buyerName: z.string().nullable(),
  buyerGstin: z.string().nullable(),
  placeOfSupply: z.string().nullable().describe("Place of supply state as printed (name or GST state code)"),
  lines: z
    .array(
      z.object({
        description: z.string(),
        packagingCategory: z
          .string()
          .nullable()
          .describe("EPR plastic packaging category if it can be determined: Category I rigid, II flexible (pouches, films, carry bags), III multi-layered, IV compostable. Null if unsure."),
        quantity: z.number().nullable().describe("Quantity as printed"),
        unit: z.string().nullable().describe("Unit as printed, e.g. kg, MT, pcs"),
        weightKg: z.number().nullable().describe("Total weight of plastic packaging for this line in kg, only if printed or directly computable from printed weights"),
        confidence,
      }),
    )
    .describe("Line items for plastic packaging or packaged goods"),
  confidence: z.object({ invoiceNumber: confidence, invoiceDate: confidence, sellerGstin: confidence, buyerGstin: confidence, placeOfSupply: confidence }),
  warnings: z.array(z.string()),
});

export type CertificateExtraction = z.infer<typeof certificateExtractionSchema>;
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
