import { z } from "zod";
import { validateGstin } from "@/lib/domain/gstin";
import { ROLES } from "@/lib/domain/permissions";
import { STATE_CODES } from "@/lib/domain/states";
import { emailSchema } from "./auth";
import { cleanText, optionalText, text } from "./common";

export const ENTITY_TYPES = ["PRODUCER", "IMPORTER", "BRAND_OWNER"] as const;
export const WASTE_STREAMS = ["PLASTIC", "EWASTE", "BATTERY"] as const;

/** Optional upper-case identifier (PAN, CIN, CPCB no.) validated against a pattern. */
function optionalCode(label: string, pattern: RegExp, example: string) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? cleanText(v).toUpperCase().replace(/\s+/g, "") : undefined))
    .refine((v) => v === undefined || pattern.test(v), `${label} format is invalid (e.g. ${example})`);
}

export const gstinSchema = z.string().transform((value, ctx) => {
  const result = validateGstin(value);
  if (!result.valid) {
    ctx.addIssue({ code: "custom", message: result.reason });
    return z.NEVER;
  }
  return { gstin: result.gstin, stateCode: result.stateCode };
});

export const organizationDetailsSchema = z.object({
  name: text("Company name", { min: 2, max: 120 }),
  legalName: optionalText("Legal name", 200),
  entityTypes: z
    .array(z.enum(ENTITY_TYPES), { message: "Select at least one entity type" })
    .min(1, "Select at least one entity type")
    .transform((v) => [...new Set(v)]),
  wasteStreams: z
    .array(z.enum(WASTE_STREAMS), { message: "Select at least one waste stream" })
    .min(1, "Select at least one waste stream")
    .transform((v) => [...new Set(v)]),
  headOfficeState: z.enum(STATE_CODES, { message: "Select a state" }),
  cpcbRegistrationNo: optionalCode("CPCB registration no.", /^[A-Z0-9/_-]{4,60}$/, "PWP-12-AAAAA1234A"),
  pan: optionalCode("PAN", /^[A-Z]{5}[0-9]{4}[A-Z]$/, "AAACD1234F"),
  cin: optionalCode("CIN", /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, "U12345MH2010PTC123456"),
  registeredAddress: optionalText("Registered address", 500, { multiline: true }),
});

export const onboardingSchema = organizationDetailsSchema.extend({
  gstins: z
    .array(gstinSchema)
    .max(50, "You can add up to 50 GSTINs here — add more later")
    .refine((list) => new Set(list.map((g) => g.gstin)).size === list.length, "Duplicate GSTIN"),
  brands: z
    .array(text("Brand name", { max: 100 }))
    .max(100, "You can add up to 100 brands here — add more later")
    .refine((list) => new Set(list.map((b) => b.toLowerCase())).size === list.length, "Duplicate brand name"),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES, { message: "Select a role" }),
});

export const changeRoleSchema = z.object({
  membershipId: z.string().min(1).max(40),
  role: z.enum(ROLES),
});
