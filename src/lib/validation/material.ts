import { z } from "zod";
import { checkReportingMonth, financialYearOf, monthKey, parseMonth } from "@/lib/domain/financial-year";
import { kgString, MAX_QUANTITY_KG, parseNumber, toKg } from "@/lib/domain/units";
import { STATE_CODES } from "@/lib/domain/states";
import { ENTITY_TYPES } from "./organization";
import { optionalText } from "./common";

const optionalId = z
  .string()
  .max(40)
  .optional()
  .transform((v) => (v && v !== "none" ? v : null));

const amount = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .transform((v, ctx) => {
      const n = parseNumber(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number, e.g. 1250.5` });
        return z.NEVER;
      }
      return n;
    });

/** Manual material entry. Ownership of the referenced ids is checked in the action. */
export const materialEntrySchema = z
  .object({
    month: z
      .string({ message: "Month is required" })
      .min(1, "Month is required")
      .transform((v, ctx) => {
        const month = parseMonth(v);
        if (!month) {
          ctx.addIssue({ code: "custom", message: "Select a valid month" });
          return z.NEVER;
        }
        const problem = checkReportingMonth(month, new Date());
        if (problem) {
          ctx.addIssue({ code: "custom", message: problem });
          return z.NEVER;
        }
        return month;
      }),
    categoryId: z.string({ message: "Select a category" }).min(1, "Select a category").max(40),
    entityType: z.enum(ENTITY_TYPES, { message: "Select an entity type" }),
    stateCode: z.enum(STATE_CODES, { message: "Select a state" }),
    brandId: optionalId,
    plantId: optionalId,
    gstRegistrationId: optionalId,
    quantity: amount("Quantity"),
    unit: z.enum(["kg", "tonne"], { message: "Select a unit" }),
    recycledContent: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v || !v.trim()) return null;
        const n = parseNumber(v);
        if (n === null) {
          ctx.addIssue({ code: "custom", message: "Recycled content must be a number" });
          return z.NEVER;
        }
        return n;
      }),
    isPreConsumer: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
    notes: optionalText("Notes", 500, { multiline: true }),
  })
  .transform((d, ctx) => {
    const quantityKg = toKg(d.quantity, d.unit);
    if (quantityKg <= 0) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be greater than zero" });
    if (quantityKg > MAX_QUANTITY_KG) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity is unrealistically large — check the unit" });
    }
    const recycledKg = d.recycledContent === null ? null : toKg(d.recycledContent, d.unit);
    if (recycledKg !== null && recycledKg > quantityKg) {
      ctx.addIssue({ code: "custom", path: ["recycledContent"], message: "Recycled content cannot exceed the quantity" });
    }
    return {
      periodMonth: new Date(`${monthKey(d.month)}-01T00:00:00Z`),
      financialYear: financialYearOf(d.month),
      categoryId: d.categoryId,
      entityType: d.entityType,
      stateCode: d.stateCode,
      brandId: d.brandId,
      plantId: d.plantId,
      gstRegistrationId: d.gstRegistrationId,
      quantityKg: kgString(quantityKg),
      recycledContentKg: recycledKg === null ? null : kgString(recycledKg),
      isPreConsumer: d.isPreConsumer,
      notes: d.notes ?? null,
    };
  });

export type MaterialEntryInput = z.output<typeof materialEntrySchema>;
