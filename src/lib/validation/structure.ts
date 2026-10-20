import { z } from "zod";
import { STATE_CODES } from "@/lib/domain/states";
import { optionalText, text } from "./common";
import { gstinSchema } from "./organization";

const id = z.string().min(1).max(40);
const optionalId = z
  .string()
  .max(40)
  .optional()
  .transform((v) => (v && v !== "none" ? v : null));

export const brandSchema = z.object({
  name: text("Brand name", { max: 100 }),
  description: optionalText("Description", 300),
});

export const gstRegistrationSchema = z.object({
  gstin: gstinSchema,
  legalName: optionalText("Legal name", 200),
  tradeName: optionalText("Trade name", 200),
});

export const plantSchema = z.object({
  name: text("Plant name", { max: 120 }),
  stateCode: z.enum(STATE_CODES, { message: "Select a state" }),
  city: optionalText("City", 80),
  address: optionalText("Address", 300, { multiline: true }),
  pincode: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim() : undefined))
    .refine((v) => v === undefined || v === "" || /^[1-9][0-9]{5}$/.test(v), "PIN code must be 6 digits")
    .transform((v) => v || undefined),
  gstRegistrationId: optionalId,
});

export const recordIdSchema = z.object({ id });
