"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { isFinancialYear } from "@/lib/domain/financial-year";
import { parseNumber } from "@/lib/domain/units";
import { recyclerSchema } from "@/lib/validation/certificate";

const ID = /^[a-z0-9]{10,40}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return new Date(`${v}T00:00:00Z`);
  });

const adminRecyclerSchema = recyclerSchema.extend({
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "SUSPENDED"], { message: "Choose a status" }),
  registrationValidFrom: optionalDate,
  registrationValidTo: optionalDate,
}).refine((v) => !v.registrationValidFrom || !v.registrationValidTo || v.registrationValidTo > v.registrationValidFrom, {
  path: ["registrationValidTo"],
  message: "The end date must be after the start date",
});

/** Create (id null) or update a platform recycler, including its verification status. */
export async function saveRecyclerAction(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (id !== null && !ID.test(id)) return { error: "Invalid request." };
    const user = await requirePlatformAdmin();
    const parsed = adminRecyclerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const d = parsed.data;
    const data = {
      name: d.name,
      cpcbRegistrationNo: d.cpcbRegistrationNo ?? null,
      stateCode: d.stateCode,
      city: d.city ?? null,
      contactEmail: d.contactEmail ?? null,
      contactPhone: d.contactPhone ?? null,
      verificationStatus: d.verificationStatus,
      registrationValidFrom: d.registrationValidFrom,
      registrationValidTo: d.registrationValidTo,
    };

    const before = id ? await prisma.recycler.findUnique({ where: { id } }) : null;
    if (id && !before) return { error: "Recycler not found." };
    await prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.recycler.update({
            where: { id: before.id },
            data: { ...data, verifiedAt: d.verificationStatus === "VERIFIED" && before.verificationStatus !== "VERIFIED" ? new Date() : before.verifiedAt },
          })
        : await tx.recycler.create({ data: { ...data, organizationId: null, verifiedAt: d.verificationStatus === "VERIFIED" ? new Date() : null } });
      await audit(tx, {
        organizationId: null,
        actorId: user.id,
        action: before ? "recycler.update" : "recycler.create",
        entityType: "Recycler",
        entityId: saved.id,
        before: before ? { verificationStatus: before.verificationStatus, registrationValidTo: before.registrationValidTo } : undefined,
        after: { verificationStatus: data.verificationStatus, registrationValidTo: data.registrationValidTo },
      });
    });
    revalidatePath("/admin/recyclers");
    return { ok: true, message: before ? "Recycler updated. Open certificates are re-checked daily." : `${d.name} added to the directory.` };
  } catch (error) {
    return handleActionError(error);
  }
}

const capacitySchema = z.object({
  categoryId: z.string().regex(ID, "Select a category"),
  financialYear: z.string().refine(isFinancialYear, "Select a financial year"),
  capacityTonnes: z.string().transform((v, ctx) => {
    const n = parseNumber(v);
    if (n === null || n <= 0 || n > 10_000_000) {
      ctx.addIssue({ code: "custom", message: "Enter the annual capacity in tonnes, e.g. 1200" });
      return z.NEVER;
    }
    return n;
  }),
});

/** Sets a recycler's registered annual capacity for a category and FY (used by the capacity check). */
export async function saveCapacityAction(recyclerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (!ID.test(recyclerId)) return { error: "Invalid request." };
    const user = await requirePlatformAdmin();
    const parsed = capacitySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const { categoryId, financialYear, capacityTonnes } = parsed.data;
    const annualCapacityKg = (capacityTonnes * 1000).toFixed(3);

    await prisma.$transaction(async (tx) => {
      const row = await tx.recyclerCapacity.upsert({
        where: { recyclerId_categoryId_financialYear: { recyclerId, categoryId, financialYear } },
        create: { recyclerId, categoryId, financialYear, annualCapacityKg },
        update: { annualCapacityKg },
      });
      await audit(tx, { organizationId: null, actorId: user.id, action: "recycler.capacity", entityType: "RecyclerCapacity", entityId: row.id, after: { categoryId, financialYear, capacityTonnes } });
    });
    revalidatePath("/admin/recyclers");
    return { ok: true, message: `Capacity for FY ${financialYear} saved.` };
  } catch (error) {
    return handleActionError(error);
  }
}
