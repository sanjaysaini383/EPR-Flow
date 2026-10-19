import { z } from "zod";
import { validateGstin } from "@/lib/domain/gstin";
import { ROLES } from "@/lib/domain/permissions";
import { STATE_CODES } from "@/lib/domain/states";
import { emailSchema } from "./auth";

export const ENTITY_TYPES = ["PRODUCER", "IMPORTER", "BRAND_OWNER"] as const;
export const WASTE_STREAMS = ["PLASTIC", "EWASTE", "BATTERY"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const gstinSchema = z.string().transform((value, ctx) => {
  const result = validateGstin(value);
  if (!result.valid) {
    ctx.addIssue({ code: "custom", message: result.reason });
    return z.NEVER;
  }
  return { gstin: result.gstin, stateCode: result.stateCode };
});

export const organizationDetailsSchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(120),
  legalName: optionalText(200),
  entityTypes: z.array(z.enum(ENTITY_TYPES)).min(1, "Select at least one entity type"),
  wasteStreams: z.array(z.enum(WASTE_STREAMS)).min(1, "Select at least one waste stream"),
  headOfficeState: z.enum(STATE_CODES, { message: "Select a state" }),
  cpcbRegistrationNo: optionalText(60),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN format is invalid")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  cin: optionalText(21),
  registeredAddress: optionalText(500),
});

export const onboardingSchema = organizationDetailsSchema.extend({
  gstins: z
    .array(gstinSchema)
    .max(50)
    .refine((list) => new Set(list.map((g) => g.gstin)).size === list.length, "Duplicate GSTIN"),
  brands: z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .refine((list) => new Set(list.map((b) => b.toLowerCase())).size === list.length, "Duplicate brand name"),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES),
});

export const changeRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(ROLES),
});
