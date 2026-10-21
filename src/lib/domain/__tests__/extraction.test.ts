import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificateExtraction, InvoiceExtraction } from "@/lib/ai/schemas";
import { certificateDraft, invoiceDraft, lowConfidenceFields } from "../extraction/map";

const categories = [
  { id: "c1", code: "PLASTIC_CAT_I", name: "Category I – Rigid plastic packaging", stream: "PLASTIC" },
  { id: "c2", code: "PLASTIC_CAT_II", name: "Category II – Flexible plastic packaging", stream: "PLASTIC" },
  { id: "c3", code: "PLASTIC_CAT_III", name: "Category III – Multi-layered plastic packaging", stream: "PLASTIC" },
];
const recyclers = [
  { id: "r1", name: "GreenLoop Plastics LLP", registrationNo: "PWP-KA-0177" },
  { id: "r2", name: "Shree Polymers Recycling Pvt Ltd", registrationNo: "PWP-MH-0412" },
];
const sure = { certificateNumber: 1, recyclerName: 1, recyclerRegistrationNo: 1, category: 1, certificateType: 1, quantityKg: 1, issueDate: 1, transferDate: 1, financialYear: 1 };
const cert = (over: Partial<CertificateExtraction>): CertificateExtraction => ({
  certificateNumber: "EPR/KA-0177/2026/000519",
  recyclerName: "GreenLoop Plastics LLP",
  recyclerRegistrationNo: "PWP-KA-0177",
  category: "Category II",
  certificateType: "RECYCLING",
  quantityKg: 18_500,
  issueDate: "2026-10-02",
  transferDate: null,
  financialYear: null,
  confidence: sure,
  warnings: [],
  ...over,
});

describe("certificate drafts", () => {
  const ctx = { categories, enabledStreams: ["PLASTIC"], recyclers };

  it("matches the recycler and category and derives the FY", () => {
    const { defaults, check, notes } = certificateDraft(cert({}), ctx);
    expect(defaults).toMatchObject({ recyclerId: "r1", categoryId: "c2", type: "RECYCLING", financialYear: "2026-27", quantity: "18500", issueDate: "2026-10-02" });
    expect(check).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("matches recyclers by registration number ignoring punctuation, then by name", () => {
    expect(certificateDraft(cert({ recyclerRegistrationNo: "pwp mh 0412", recyclerName: "Someone else" }), ctx).defaults.recyclerId).toBe("r2");
    expect(certificateDraft(cert({ recyclerRegistrationNo: null, recyclerName: "Shree Polymers Recycling Private Limited" }), ctx).defaults.recyclerId).toBe("r2");
    const unknown = certificateDraft(cert({ recyclerRegistrationNo: "PWP-GJ-9999", recyclerName: "Unknown Recyclers" }), ctx);
    expect(unknown.defaults.recyclerId).toBeUndefined();
    expect(unknown.notes[0]).toContain("is not in your directory");
  });

  it("drops implausible values and lists low-confidence fields, least sure first", () => {
    const d = certificateDraft(cert({ issueDate: "2026-02-30", quantityKg: -5, confidence: { ...sure, quantityKg: 0.4, transferDate: 0.6 }, warnings: ["Overwritten figure"] }), ctx);
    expect(d.defaults.issueDate).toBeUndefined();
    expect(d.defaults.quantity).toBeUndefined();
    expect(d.check).toEqual(["Quantity (40% sure)", "Transfer date (60% sure)"]);
    expect(d.notes).toContain("Overwritten figure");
    expect(d.notes.some((n) => n.includes("could not be read as a date"))).toBe(true);
  });
});

describe("invoice drafts", () => {
  const ctx = { categories, enabledStreams: ["PLASTIC"], gstins: [{ id: "g1", gstin: "27AAACD1234F1Z7", stateCode: "MH" }] };
  const invoice = (over: Partial<InvoiceExtraction>): InvoiceExtraction => ({
    invoiceNumber: "PK/0917",
    invoiceDate: "2026-09-14",
    sellerName: "Demo",
    sellerGstin: "27AAACD1234F1Z7",
    buyerName: "Metro",
    buyerGstin: "29AAGCM4321Q1Z8",
    placeOfSupply: "Karnataka",
    lines: [
      { description: "Pouches", packagingCategory: "Cat III", quantity: 120000, unit: "pcs", weightKg: 540, confidence: 0.9 },
      { description: "Shrink film", packagingCategory: "Category II", quantity: 0.35, unit: "MT", weightKg: null, confidence: 0.6 },
      { description: "Bottles", packagingCategory: null, quantity: 200, unit: "pcs", weightKg: null, confidence: 0.9 },
    ],
    confidence: { invoiceNumber: 1, invoiceDate: 1, sellerGstin: 1, buyerGstin: 1, placeOfSupply: 1 },
    warnings: [],
    ...over,
  });

  it("uses the place of supply for the state and matches the seller GSTIN", () => {
    const d = invoiceDraft(invoice({}), ctx);
    expect(d).toMatchObject({ month: "2026-09", stateCode: "KA", gstRegistrationId: "g1", reference: "Invoice PK/0917 to Metro" });
  });

  it("converts units, and flags lines needing a weight or a category", () => {
    const { rows } = invoiceDraft(invoice({}), ctx);
    expect(rows[0]).toMatchObject({ categoryId: "c3", quantityKg: 540, issue: null });
    expect(rows[1]).toMatchObject({ categoryId: "c2", quantityKg: 350, issue: "Low confidence — check this line" });
    expect(rows[2]).toMatchObject({ categoryId: null, quantityKg: null, issue: "Weight not printed — enter the plastic weight in kg" });
  });

  it("falls back to the buyer GSTIN's state code, and reports unknown seller GSTINs", () => {
    const d = invoiceDraft(invoice({ placeOfSupply: null, sellerGstin: "07AAAAA0000A1Z5" }), ctx);
    expect(d.stateCode).toBe("KA");
    expect(d.gstRegistrationId).toBeNull();
    expect(d.notes[0]).toContain("is not one of your registrations");
    expect(invoiceDraft(invoice({ placeOfSupply: "29-Karnataka" }), ctx).stateCode).toBe("KA");
  });

  it("lists low-confidence header fields", () => {
    expect(lowConfidenceFields({ invoiceNumber: 0.5, junk: 0.1 }, { invoiceNumber: "Invoice number" })).toEqual(["Invoice number (50% sure)"]);
  });
});

// ── Claude call, with the SDK mocked ─────────────────────────────────────────

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class BadRequestError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    static BadRequestError = BadRequestError;
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});

describe("Claude extraction provider", () => {
  const env = { ...process.env };
  beforeEach(() => {
    parse.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.AI_PROVIDER;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("is not available without credentials", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    expect(getExtractionProvider()).toBeNull();
  });

  it("never uses the fake provider in production", async () => {
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    process.env.AI_PROVIDER = "fake";
    vi.stubEnv("NODE_ENV", "production");
    expect(getExtractionProvider()?.name).toBe("claude");
    vi.unstubAllEnvs();
  });

  it("sends the PDF with the model from ANTHROPIC_MODEL, structured output and refusal fallbacks", async () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    parse.mockResolvedValue({ stop_reason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 1200, output_tokens: 300 }, parsed_output: cert({}) });
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    const result = await getExtractionProvider()!.extract({ bytes: new TextEncoder().encode("%PDF-1.7"), mimeType: "application/pdf", target: "CERTIFICATE" });

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
    expect(result).toMatchObject({ target: "CERTIFICATE", model: "claude-sonnet-5-5", inputTokens: 1200, outputTokens: 300 });
  });

  it("defaults to Claude Opus 5.5 and sends images as image blocks", async () => {
    delete process.env.ANTHROPIC_MODEL;
    parse.mockResolvedValue({ stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: cert({}) });
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    await getExtractionProvider()!.extract({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg", target: "CERTIFICATE" });
    expect(parse.mock.calls[0][0].model).toBe("claude-opus-5-5");
    expect(parse.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });

  it("turns refusals, truncation and unparseable output into readable errors", async () => {
    const { getExtractionProvider, ExtractionError } = await import("@/lib/ai/extract");
    const run = () => getExtractionProvider()!.extract({ bytes: new Uint8Array([1]), mimeType: "application/pdf", target: "MATERIAL_ENTRY" });
    parse.mockResolvedValueOnce({ stop_reason: "refusal", usage: {}, parsed_output: null });
    await expect(run()).rejects.toThrow(ExtractionError);
    parse.mockResolvedValueOnce({ stop_reason: "max_tokens", usage: {}, parsed_output: null });
    await expect(run()).rejects.toThrow("too long");
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", usage: {}, parsed_output: null });
    await expect(run()).rejects.toThrow("could not be understood");
  });
});
