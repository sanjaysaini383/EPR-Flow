"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { deadlineSpecSchema } from "@/lib/domain/deadlines/statutory";
import { parseNumber } from "@/lib/domain/units";
import { optionalText } from "@/lib/validation/common";

const parametersSchema = z
  .object({
    baseMethod: z.enum(["AVERAGE_PREVIOUS_YEARS", "CURRENT_YEAR"]).optional(),
    lookbackYears: z.number().int().min(1).max(5).optional(),
    deductPreConsumer: z.boolean().optional(),
    annualReturnDue: z
      .string()
      .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "annualReturnDue must be MM-DD")
      .optional(),
    deadlines: z.array(deadlineSpecSchema.strict()).max(10).optional(),
  })
  .strict();

const editSchema = z.object({
  value: z
    .string({ message: "Enter a value" })
    .trim()
    .min(1, "Enter a value")
    .transform((v, ctx) => {
      const n = parseNumber(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "Enter a number, e.g. 70" });
        return z.NEVER;
      }
      return n;
    }),
  parameters: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return undefined;
      try {
        const parsed = parametersSchema.safeParse(JSON.parse(v));
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: parsed.error.issues.map((i) => i.message).join("; ") });
          return z.NEVER;
        }
        return parsed.data;
      } catch {
        ctx.addIssue({ code: "custom", message: "Parameters must be valid JSON" });
        return z.NEVER;
      }
    }),
  sourceReference: optionalText("Source", 300),
  notes: optionalText("Notes", 500, { multiline: true }),
  isVerified: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/**
 * Editing a rule never overwrites it: a new version with the same scope is created, so
 * snapshots computed with the old values stay reproducible (they store the rule ids).
 */
export async function saveRuleVersionAction(ruleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlatformAdmin();
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const input = parsed.data;

    const current = await prisma.regulationRule.findUnique({ where: { id: ruleId } });
    if (!current) return { error: "Rule not found." };
    if (current.unit === "PERCENT" && (input.value < 0 || input.value > 100)) {
      return { fieldErrors: { value: ["A percentage must be between 0 and 100"] } };
    }

    const latest = await prisma.regulationRule.findFirst({
      where: {
        stream: current.stream,
        categoryId: current.categoryId,
        entityType: current.entityType,
        ruleType: current.ruleType,
        financialYear: current.financialYear,
        effectiveFrom: current.effectiveFrom,
      },
      orderBy: { version: "desc" },
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.regulationRule.create({
        data: {
          stream: current.stream,
          categoryId: current.categoryId,
          entityType: current.entityType,
          ruleType: current.ruleType,
          financialYear: current.financialYear,
          effectiveFrom: current.effectiveFrom,
          effectiveTo: current.effectiveTo,
          unit: current.unit,
          value: input.value,
          parameters: input.parameters ?? (current.parameters as object | undefined) ?? undefined,
          sourceReference: input.sourceReference ?? null,
          notes: input.notes ?? null,
          isVerified: input.isVerified,
          version: (latest?.version ?? current.version) + 1,
          createdById: user.id,
        },
      });
      await audit(tx, {
        organizationId: null,
        actorId: user.id,
        action: "rule.new_version",
        entityType: "RegulationRule",
        entityId: created.id,
        before: { id: current.id, value: current.value.toString(), version: current.version, isVerified: current.isVerified },
        after: { value: input.value, version: created.version, isVerified: input.isVerified },
      });
    });
    revalidatePath("/admin/rules");
    return { ok: true, message: "New rule version saved. It applies to every organisation immediately." };
  } catch (error) {
    return handleActionError(error);
  }
}
