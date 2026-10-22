import "server-only";
import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { SYSTEM_PROMPT, TASK_PROMPT } from "./prompts";
import { certificateExtractionSchema, invoiceExtractionSchema } from "./schemas";
import { ExtractionError, type ExtractionProvider } from "./types";

/** Default Gemini model (available on the free tier); override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type Json = Record<string, unknown>;

/**
 * Zod emits nullable fields as `anyOf: [{…}, {type: "null"}]`; Gemini's JSON-schema mode
 * handles `type: ["string", "null"]` most reliably, so nullable unions are flattened
 * and the `$schema` marker is dropped. The response is still validated with Zod.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const { $schema: _drop, ...rest } = node as Json;
  const anyOf = rest.anyOf as Json[] | undefined;
  if (anyOf && anyOf.length === 2 && anyOf.some((s) => s.type === "null")) {
    const other = anyOf.find((s) => s.type !== "null")!;
    const { anyOf: _a, ...withoutAnyOf } = rest;
    const merged = toGeminiSchema({ ...other, ...withoutAnyOf }) as Json;
    return { ...merged, type: [other.type, "null"] };
  }
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, toGeminiSchema(v)]));
}

const SCHEMAS = {
  CERTIFICATE: toGeminiSchema(z.toJSONSchema(certificateExtractionSchema)),
  MATERIAL_ENTRY: toGeminiSchema(z.toJSONSchema(invoiceExtractionSchema)),
};

export function geminiProvider(apiKey: string): ExtractionProvider {
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    name: "gemini",
    async extract({ bytes, mimeType, target }) {
      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [{ inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }, { text: TASK_PROMPT[target] }],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: SCHEMAS[target],
            temperature: 0,
            maxOutputTokens: 16000,
          },
        });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403) throw new ExtractionError("The Gemini API key is invalid. Check GEMINI_API_KEY.");
          if (error.status === 429) throw new ExtractionError("The free AI quota is used up for now. Try again in a minute, or enter the details by hand.");
          if (error.status === 400) throw new ExtractionError("The document could not be read (it may be encrypted, corrupted or too large).");
          throw new ExtractionError(`The AI service returned an error (${error.status}). Try again later.`);
        }
        throw error;
      }

      const finish = response.candidates?.[0]?.finishReason;
      if (response.promptFeedback?.blockReason || finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
        throw new ExtractionError("The AI declined to read this document. Enter the details manually.");
      }
      if (finish === FinishReason.MAX_TOKENS) throw new ExtractionError("The document is too long to extract in one go. Enter the details manually or upload fewer pages.");

      let json: unknown;
      try {
        json = JSON.parse(response.text ?? "");
      } catch {
        throw new ExtractionError("The AI response could not be understood. Try again or enter the details manually.");
      }
      const usage = { model, inputTokens: response.usageMetadata?.promptTokenCount ?? null, outputTokens: response.usageMetadata?.candidatesTokenCount ?? null };
      const parsed = target === "CERTIFICATE" ? certificateExtractionSchema.safeParse(json) : invoiceExtractionSchema.safeParse(json);
      if (!parsed.success) throw new ExtractionError("The AI response was incomplete. Try again or enter the details manually.");
      return target === "CERTIFICATE"
        ? { target, data: parsed.data as z.infer<typeof certificateExtractionSchema>, ...usage }
        : { target, data: parsed.data as z.infer<typeof invoiceExtractionSchema>, ...usage };
    },
  };
}
