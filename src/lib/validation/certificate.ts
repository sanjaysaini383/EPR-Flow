import { z } from "zod";
import { istToday } from "@/lib/domain/deadlines/schedule";
import { isFinancialYear } from "@/lib/domain/financial-year";
import { STATE_CODES } from "@/lib/domain/states";
import { MAX_QUANTITY_KG, parseNumber, parseUnit, toKg } from "@/lib/domain/units";
import { optionalText, text } from "./common";

const ID = /^[a-z0-9]{10,40}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function calendarDate(raw: string): Date | null {
  if (!DATE.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Certificate form/extraction input. `now` fixes "today" (IST) for tests. */
export function certificateSchema(now = new Date()) {
  const today = istToday(now);
  const date = (label: string) =>
    z
      .string({ message: `Enter the ${label}` })
      .transform((v, ctx) => {
        const d = calendarDate(v.trim());
        if (!d) {
          ctx.addIssue({ code: "custom", message: v.trim() ? "This date does not exist" : `Enter the ${label}` });
          return z.NEVER;
        }
        if (d > today) {
          ctx.addIssue({ code: "custom", message: `The ${label} cannot be in the future` });
          return z.NEVER;
        }
        if (d < new Date(Date.UTC(2016, 3, 1))) {
          ctx.addIssue({ code: "custom", message: `The ${label} is before EPR rules applied` });
          return z.NEVER;
        }
        return d;
      });

  return z
    .object({
      certificateNumber: text("Certificate number", { min: 3, max: 60 }).refine(
        (v) => /^[A-Za-z0-9/\-_. ]+$/.test(v),
        "Use letters, digits and / - _ . only",
      ),
      recyclerId: z.string({ message: "Select the recycler" }).regex(ID, "Select the recycler"),
      categoryId: z.string({ message: "Select a category" }).regex(ID, "Select a category"),
      type: z.enum(["RECYCLING", "END_OF_LIFE"], { message: "Select the certificate type" }),
      financialYear: z.string({ message: "Select the financial year" }).refine(isFinancialYear, "Select the financial year"),
      stateCode: z
        .string()
        .optional()
        .transform((v) => (v && v !== "none" ? v : undefined))
        .pipe(z.enum(STATE_CODES, { message: "Select a state" }).optional()),
      // Checked per field so its error shows together with the others; units are applied below.
      quantity: z.string({ message: "Enter the quantity" }).transform((v, ctx) => {
        const n = parseNumber(v);
        if (n === null || n <= 0) {
          ctx.addIssue({ code: "custom", message: v.trim() ? "Enter a quantity greater than zero" : "Enter the quantity" });
          return z.NEVER;
        }
        return n;
      }),
      unit: z.string().optional(),
      issueDate: date("issue date"),
      transferDate: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? v.trim() : undefined))
        .pipe(date("transfer date").optional()),
      cost: z
        .string()
        .optional()
        .transform((v, ctx) => {
          if (!v?.trim()) return null;
          const n = parseNumber(v);
          if (n === null || n < 0 || n > 1e11) {
            ctx.addIssue({ code: "custom", message: "Enter the amount paid in rupees, e.g. 125000" });
            return z.NEVER;
          }
          return Math.round(n * 100) / 100;
        }),
      notes: optionalText("Notes", 500, { multiline: true }),
    })
    .transform((v, ctx) => {
      const unit = parseUnit(v.unit || "kg");
      if (!unit) {
        ctx.addIssue({ code: "custom", path: ["unit"], message: "Use kg or tonne" });
        return z.NEVER;
      }
      const quantityKg = toKg(v.quantity, unit);
      if (quantityKg > MAX_QUANTITY_KG) {
        ctx.addIssue({ code: "custom", path: ["quantity"], message: "This quantity is too large — check the unit" });
        return z.NEVER;
      }
      if (v.transferDate && v.transferDate < v.issueDate) {
        ctx.addIssue({ code: "custom", path: ["transferDate"], message: "The transfer date cannot be before the issue date" });
        return z.NEVER;
      }
      const { unit: _u, quantity: _q, ...rest } = v;
      return {
        ...rest,
        quantityKg,
        pricePerKgInr: v.cost === null ? null : Math.round((v.cost / quantityKg) * 10_000) / 10_000,
      };
    });
}

export type CertificateInput = z.output<ReturnType<typeof certificateSchema>>;

export const rejectSchema = z.object({ reason: text("Reason", { min: 5, max: 500 }) });
export const dismissSchema = z.object({ note: text("Note", { min: 5, max: 500 }) });

export const recyclerSchema = z.object({
  name: text("Name", { min: 3, max: 160 }),
  cpcbRegistrationNo: optionalText("CPCB registration no.", 60),
  stateCode: z.enum(STATE_CODES, { message: "Select a state" }),
  city: optionalText("City", 80),
  contactEmail: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim().toLowerCase() : undefined))
    .pipe(z.email("Enter a valid email address").optional()),
  contactPhone: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.replace(/[\s()-]/g, "") : undefined))
    .pipe(
      z
        .string()
        .regex(/^\+?\d{10,13}$/, "Enter a 10-digit mobile or landline number")
        .optional(),
    ),
});

export const ratingSchema = z.object({
  rating: z.coerce.number({ message: "Choose a rating" }).int().min(1, "Choose a rating").max(5, "Choose a rating"),
  comment: optionalText("Comment", 500, { multiline: true }),
});
