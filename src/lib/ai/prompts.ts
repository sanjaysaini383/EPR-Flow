/** Instructions shared by every extraction provider, so Claude and Gemini are asked the same thing. */

export type ExtractionTarget = "CERTIFICATE" | "MATERIAL_ENTRY";

export const SYSTEM_PROMPT = `You read documents for an Indian EPR (Extended Producer Responsibility) compliance team: EPR certificates issued by registered plastic waste processors under the Plastic Waste Management Rules 2022, and invoices for plastic packaging or packaged goods.

Extract only what is printed on the document. When a value is missing, illegible or ambiguous, return null and lower its confidence — never infer or invent numbers, dates or registration numbers. Convert tonnes/MT to kilograms. Dates as YYYY-MM-DD (Indian documents usually print day first). Mention anything suspicious (overwritten figures, missing signature or stamp, totals that do not match) in warnings.`;

export const TASK_PROMPT: Record<ExtractionTarget, string> = {
  CERTIFICATE: "Extract the EPR certificate details from this document.",
  MATERIAL_ENTRY: "Extract the invoice header and every line item that is plastic packaging or packaged goods from this document.",
};
