"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import type { TenantDb } from "@/lib/db/tenant";
import { stateName } from "@/lib/domain/states";
import { materialEntrySchema, type MaterialEntryInput } from "@/lib/validation/material";
import { entryKey, existingEntryKeys, loadMaterialContext } from "./queries";

type FieldErrors = Record<string, string[]>;

/**
 * Ids in the form come from the browser. Verify each one belongs to this organisation
 * (the tenant client only returns the org's own rows) and is consistent with the entry.
 * References an existing entry already had are allowed even if since archived.
 */
async function checkReferences(
  db: TenantDb,
  org: { entityTypes: string[]; wasteStreams: string[] },
  input: MaterialEntryInput,
  existing?: { categoryId: string; brandId: string | null; plantId: string | null; gstRegistrationId: string | null },
): Promise<FieldErrors | null> {
  const ctx = await loadMaterialContext(db, org);
  const errors: FieldErrors = {};

  if (!ctx.categories.some((c) => c.id === input.categoryId) && input.categoryId !== existing?.categoryId) {
    errors.categoryId = ["Select a category for one of your enabled waste streams"];
  }
  if (!org.entityTypes.includes(input.entityType)) {
    errors.entityType = ["Your organisation is not registered with this entity type"];
  }
  if (input.brandId && input.brandId !== existing?.brandId && !ctx.brands.some((b) => b.id === input.brandId)) {
    errors.brandId = ["Select one of your active brands"];
  }
  if (input.plantId && input.plantId !== existing?.plantId && !ctx.plants.some((p) => p.id === input.plantId)) {
    errors.plantId = ["Select one of your active plants"];
  }
  if (input.gstRegistrationId) {
    const gst =
      ctx.gstins.find((g) => g.id === input.gstRegistrationId) ??
      (input.gstRegistrationId === existing?.gstRegistrationId
        ? await db.gstRegistration.findUnique({ where: { id: input.gstRegistrationId } })
        : null);
    if (!gst) errors.gstRegistrationId = ["Select one of your active GST registrations"];
    else if (gst.stateCode !== input.stateCode) {
      errors.gstRegistrationId = [`This GSTIN is registered in ${stateName(gst.stateCode)}, not ${stateName(input.stateCode)}`];
    }
  }
  return Object.keys(errors).length ? errors : null;
}

export async function saveMaterialEntryAction(
  orgSlug: string,
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const parsed = materialEntrySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const input = parsed.data;

    const existing = id ? await db.materialEntry.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !existing) return { error: "This entry no longer exists. Refresh the page and try again." };

    const refErrors = await checkReferences(db, org, input, existing ?? undefined);
    if (refErrors) return { error: "Please fix the highlighted fields.", fieldErrors: refErrors };

    const duplicates = await existingEntryKeys(db, [input.periodMonth.toISOString()], id ?? undefined);
    if (duplicates.has(entryKey(input))) {
      return {
        error: "An entry already exists for this month, category, entity type, state, brand and plant — edit that entry instead so the quantity is not counted twice.",
      };
    }

    await db.$transaction(async (tx) => {
      const entry = id
        ? await tx.materialEntry.update({ where: { id }, data: input })
        : await tx.materialEntry.create({
            data: { ...input, organizationId: org.id, source: "MANUAL", createdById: user.id },
          });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: id ? "material.update" : "material.create",
        entityType: "MaterialEntry",
        entityId: entry.id,
        before: existing,
        after: input,
      });
    });

    revalidatePath(`/o/${orgSlug}/materials`);
    revalidatePath(`/o/${orgSlug}/dashboard`);
    return { ok: true, message: id ? "Entry updated." : "Entry added." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteMaterialEntryAction(orgSlug: string, id: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    if (typeof id !== "string" || id.length > 40) return { error: "Invalid request." };

    await db.$transaction(async (tx) => {
      const entry = await tx.materialEntry.findFirst({ where: { id, deletedAt: null } });
      if (!entry) throw new NotFound();
      // Soft delete: the row stays for the audit trail and past reports.
      await tx.materialEntry.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "material.delete",
        entityType: "MaterialEntry",
        entityId: id,
        before: entry,
      });
    });

    revalidatePath(`/o/${orgSlug}/materials`);
    revalidatePath(`/o/${orgSlug}/dashboard`);
    return { ok: true, message: "Entry deleted." };
  } catch (error) {
    if (error instanceof NotFound) return { error: "This entry was already deleted." };
    return handleActionError(error);
  }
}

class NotFound extends Error {}
