"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { isFinancialYear } from "@/lib/domain/financial-year";
import { parseNumber } from "@/lib/domain/units";

export async function markAlertsReadAction(orgSlug: string, alertId: string | null): Promise<ActionState> {
  try {
    const { db } = await requirePermission(orgSlug, "org.view");
    if (alertId !== null && (typeof alertId !== "string" || alertId.length > 40)) return { error: "Invalid request." };
    await db.alert.updateMany({ where: { readAt: null, ...(alertId ? { id: alertId } : {}) }, data: { readAt: new Date() } });
    revalidatePath(`/o/${orgSlug}`, "layout");
    return { ok: true, message: alertId ? "Marked as read." : "All alerts marked as read." };
  } catch (error) {
    return handleActionError(error);
  }
}

const budgetSchema = z.object({
  financialYear: z.string().refine(isFinancialYear, "Select a financial year"),
  amount: z
    .string({ message: "Enter a budget amount" })
    .trim()
    .min(1, "Enter a budget amount")
    .transform((v, ctx) => {
      const n = parseNumber(v);
      if (n === null || n > 1e12) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, e.g. 1200000" });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    }),
});

export async function saveBudgetAction(orgSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "budgets.manage");
    const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const { financialYear, amount } = parsed.data;

    await db.$transaction(async (tx) => {
      const before = await tx.budget.findFirst({ where: { financialYear, categoryId: null } });
      const budget = before
        ? await tx.budget.update({ where: { id: before.id }, data: { amountInr: amount.toFixed(2) } })
        : await tx.budget.create({ data: { organizationId: org.id, financialYear, amountInr: amount.toFixed(2) } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: before ? "budget.update" : "budget.create",
        entityType: "Budget",
        entityId: budget.id,
        before: before ? { amountInr: before.amountInr.toString() } : undefined,
        after: { financialYear, amountInr: amount },
      });
    });
    revalidatePath(`/o/${orgSlug}/settings/budgets`);
    revalidatePath(`/o/${orgSlug}/dashboard`);
    return { ok: true, message: `Budget for FY ${financialYear} saved.` };
  } catch (error) {
    return handleActionError(error);
  }
}
