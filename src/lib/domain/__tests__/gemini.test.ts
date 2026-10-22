import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor({ status }: { status: number }) {
      super(`status ${status}`);
      this.status = status;
    }
  }
  class GoogleGenAI {
    models = { generateContent };
  }
  const FinishReason = { STOP: "STOP", MAX_TOKENS: "MAX_TOKENS", SAFETY: "SAFETY", PROHIBITED_CONTENT: "PROHIBITED_CONTENT" };
  return { ApiError, GoogleGenAI, FinishReason };
});

const certificate = {
  certificateNumber: "EPR/KA-0177/2026/000519",
  recyclerName: "GreenLoop Plastics LLP",
  recyclerRegistrationNo: "PWP-KA-0177",
  category: "Category II",
  certificateType: "RECYCLING",
  quantityKg: 18500,
  issueDate: "2026-10-02",
  transferDate: null,
  financialYear: null,
  confidence: { certificateNumber: 1, recyclerName: 1, recyclerRegistrationNo: 1, category: 1, certificateType: 1, quantityKg: 1, issueDate: 1, transferDate: 1, financialYear: 1 },
  warnings: [],
};
const reply = (body: unknown, finishReason = "STOP") => ({
  text: typeof body === "string" ? body : JSON.stringify(body),
  candidates: [{ finishReason }],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
});
const pdf = { bytes: new TextEncoder().encode("%PDF-1.7"), mimeType: "application/pdf", target: "CERTIFICATE" as const };

describe("Gemini schema conversion", () => {
  it("flattens nullable unions and drops $schema", async () => {
    const { toGeminiSchema } = await import("@/lib/ai/gemini");
    expect(
      toGeminiSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { a: { anyOf: [{ type: "string" }, { type: "null" }], description: "x" }, b: { type: "number" } },
      }),
    ).toEqual({ type: "object", properties: { a: { type: ["string", "null"], description: "x" }, b: { type: "number" } } });
  });
});

describe("provider selection", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("uses Gemini when only a Gemini key is set, Claude when both are", async () => {
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    expect(getExtractionProvider()).toBeNull();
    process.env.GEMINI_API_KEY = "g-key";
    expect(getExtractionProvider()?.name).toBe("gemini");
    process.env.ANTHROPIC_API_KEY = "a-key";
    expect(getExtractionProvider()?.name).toBe("claude");
    process.env.AI_PROVIDER = "gemini";
    expect(getExtractionProvider()?.name).toBe("gemini");
  });

  it("returns nothing when the forced provider has no key", async () => {
    const { getExtractionProvider } = await import("@/lib/ai/extract");
    process.env.AI_PROVIDER = "gemini";
    process.env.ANTHROPIC_API_KEY = "a-key";
    expect(getExtractionProvider()).toBeNull();
  });
});

describe("Gemini provider", () => {
  const env = { ...process.env };
  beforeEach(() => generateContent.mockReset());
  afterEach(() => {
    process.env = { ...env };
  });

  it("sends the document inline with a JSON schema and validates the reply", async () => {
    process.env.GEMINI_MODEL = "gemini-test-model";
    generateContent.mockResolvedValue(reply(certificate));
    const { geminiProvider } = await import("@/lib/ai/gemini");
    const result = await geminiProvider("key").extract(pdf);

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe("gemini-test-model");
    expect(request.contents[0].parts[0].inlineData).toMatchObject({ mimeType: "application/pdf" });
    expect(request.config).toMatchObject({ responseMimeType: "application/json", temperature: 0 });
    expect(request.config.responseJsonSchema.properties.certificateNumber.type).toEqual(["string", "null"]);
    expect(result).toMatchObject({ target: "CERTIFICATE", model: "gemini-test-model", inputTokens: 900, outputTokens: 120 });
    expect(result.data).toMatchObject({ certificateNumber: "EPR/KA-0177/2026/000519" });
  });

  it("explains quota, safety blocks, truncation and malformed replies", async () => {
    const { geminiProvider } = await import("@/lib/ai/gemini");
    const { ApiError } = await import("@google/genai");
    const run = () => geminiProvider("key").extract(pdf);

    generateContent.mockRejectedValueOnce(new (ApiError as unknown as new (o: { status: number }) => Error)({ status: 429 }));
    await expect(run()).rejects.toThrow("free AI quota");
    generateContent.mockResolvedValueOnce(reply(certificate, "SAFETY"));
    await expect(run()).rejects.toThrow("declined");
    generateContent.mockResolvedValueOnce(reply(certificate, "MAX_TOKENS"));
    await expect(run()).rejects.toThrow("too long");
    generateContent.mockResolvedValueOnce(reply("not json"));
    await expect(run()).rejects.toThrow("could not be understood");
    generateContent.mockResolvedValueOnce(reply({ certificateNumber: "x" }));
    await expect(run()).rejects.toThrow("incomplete");
  });
});
