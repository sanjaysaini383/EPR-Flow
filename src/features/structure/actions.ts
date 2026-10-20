"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { stateName } from "@/lib/domain/states";
import { brandSchema, gstRegistrationSchema, plantSchema } from "@/lib/validation/structure";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function done(orgSlug: string, section: string, message: string): ActionState {
  revalidatePath(`/o/${orgSlug}/${section}`);
  revalidatePath(`/o/${orgSlug}/dashboard`);
  return { ok: true, message };
}

// ── Brands ────────────────────────────────────────────────────────────────

/** Create when `id` is null, otherwise update. */
export async function saveBrandAction(orgSlug: string, id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const parsed = brandSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const data = { name: parsed.data.name, description: parsed.data.description ?? null };

    await db.$transaction(async (tx) => {
      const before = id ? await tx.brand.findUniqueOrThrow({ where: { id } }) : null;
      const brand = id
        ? await tx.brand.update({ where: { id }, data })
        : await tx.brand.create({ data: { ...data, organizationId: org.id } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: id ? "brand.update" : "brand.create",
        entityType: "Brand",
        entityId: brand.id,
        before,
        after: data,
      });
    });
    return done(orgSlug, "brands", id ? "Brand updated." : `Brand "${data.name}" added.`);
  } catch (error) {
    if (isUniqueViolation(error)) return { fieldErrors: { name: ["A brand with this name already exists"] } };
    return handleActionError(error);
  }
}

// ── GST registrations ─────────────────────────────────────────────────────

export async function saveGstRegistrationAction(
  orgSlug: string,
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const parsed = gstRegistrationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const { gstin, stateCode } = parsed.data.gstin;

    // A GSTIN embeds the holder's PAN (characters 3–12); it must be the company's own PAN.
    if (org.pan && gstin.slice(2, 12) !== org.pan) {
      return {
        fieldErrors: {
          gstin: [`This GSTIN belongs to PAN ${gstin.slice(2, 12)}, not your organisation's PAN ${org.pan}`],
        },
      };
    }

    const data = {
      gstin,
      stateCode,
      legalName: parsed.data.legalName ?? null,
      tradeName: parsed.data.tradeName ?? null,
    };
    await db.$transaction(async (tx) => {
      const before = id ? await tx.gstRegistration.findUniqueOrThrow({ where: { id } }) : null;
      if (before && before.gstin !== gstin) {
        const inUse = await tx.materialEntry.count({ where: { gstRegistrationId: id, deletedAt: null } });
        if (inUse > 0) throw new GstinInUseError();
      }
      const reg = id
        ? await tx.gstRegistration.update({ where: { id }, data })
        : await tx.gstRegistration.create({ data: { ...data, organizationId: org.id } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: id ? "gst.update" : "gst.create",
        entityType: "GstRegistration",
        entityId: reg.id,
        before,
        after: data,
      });
    });
    return done(orgSlug, "gst", id ? "GST registration updated." : `GSTIN added for ${stateName(stateCode)}.`);
  } catch (error) {
    if (isUniqueViolation(error)) return { fieldErrors: { gstin: ["This GSTIN is already registered"] } };
    if (error instanceof GstinInUseError) {
      return { fieldErrors: { gstin: ["This GSTIN is used by material entries; archive it and add a new one instead"] } };
    }
    return handleActionError(error);
  }
}

class GstinInUseError extends Error {}

// ── Plants ────────────────────────────────────────────────────────────────

export async function savePlantAction(orgSlug: string, id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const parsed = plantSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const p = parsed.data;

    // The submitted GSTIN id comes from the browser: confirm it belongs to this org (the
    // tenant client scopes the lookup) and is registered in the plant's state.
    if (p.gstRegistrationId) {
      const gst = await db.gstRegistration.findFirst({ where: { id: p.gstRegistrationId, archivedAt: null } });
      if (!gst) return { fieldErrors: { gstRegistrationId: ["Select one of your GST registrations"] } };
      if (gst.stateCode !== p.stateCode) {
        return {
          fieldErrors: {
            gstRegistrationId: [`This GSTIN is registered in ${stateName(gst.stateCode)}, not ${stateName(p.stateCode)}`],
          },
        };
      }
    }

    const data = {
      name: p.name,
      stateCode: p.stateCode,
      city: p.city ?? null,
      address: p.address ?? null,
      pincode: p.pincode ?? null,
      gstRegistrationId: p.gstRegistrationId,
    };
    await db.$transaction(async (tx) => {
      const before = id ? await tx.plant.findUniqueOrThrow({ where: { id } }) : null;
      const plant = id
        ? await tx.plant.update({ where: { id }, data })
        : await tx.plant.create({ data: { ...data, organizationId: org.id } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: id ? "plant.update" : "plant.create",
        entityType: "Plant",
        entityId: plant.id,
        before,
        after: data,
      });
    });
    return done(orgSlug, "plants", id ? "Plant updated." : `Plant "${p.name}" added.`);
  } catch (error) {
    if (isUniqueViolation(error)) return { fieldErrors: { name: ["A plant with this name already exists"] } };
    return handleActionError(error);
  }
}

// ── Archive / restore (shared) ────────────────────────────────────────────

const ARCHIVABLE = {
  brand: { section: "brands", label: "Brand", model: "Brand" },
  plant: { section: "plants", label: "Plant", model: "Plant" },
  gst: { section: "gst", label: "GST registration", model: "GstRegistration" },
} as const;

export async function setArchivedAction(
  orgSlug: string,
  kind: keyof typeof ARCHIVABLE,
  id: string,
  archived: boolean,
): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "data.write");
    const meta = ARCHIVABLE[kind];
    if (!meta || typeof id !== "string" || id.length > 40) return { error: "Invalid request." };
    const data = { archivedAt: archived ? new Date() : null };

    await db.$transaction(async (tx) => {
      // Each branch uses the tenant client, so ids from other organisations simply match nothing.
      const result =
        kind === "brand"
          ? await tx.brand.updateMany({ where: { id }, data })
          : kind === "plant"
            ? await tx.plant.updateMany({ where: { id }, data })
            : await tx.gstRegistration.updateMany({ where: { id }, data });
      if (result.count === 0) throw new Prisma.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "" });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: `${kind}.${archived ? "archive" : "restore"}`,
        entityType: meta.model,
        entityId: id,
      });
    });
    return done(orgSlug, meta.section, `${meta.label} ${archived ? "archived" : "restored"}.`);
  } catch (error) {
    return handleActionError(error);
  }
}
