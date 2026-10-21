"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { ratingSchema, recyclerSchema } from "@/lib/validation/certificate";

const ID = /^[a-z0-9]{10,40}$/i;

/** Adds a recycler that is not in the EPRFlow directory yet. It stays private and unverified. */
export async function addRecyclerAction(orgSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "certificates.write");
    const parsed = recyclerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const d = parsed.data;

    if (d.cpcbRegistrationNo) {
      const existing = await db.recycler.findFirst({ where: { cpcbRegistrationNo: { equals: d.cpcbRegistrationNo, mode: "insensitive" } }, select: { name: true } });
      if (existing) return { error: "Please fix the highlighted fields.", fieldErrors: { cpcbRegistrationNo: [`${existing.name} already has this registration number in the directory.`] } };
    }

    await db.$transaction(async (tx) => {
      const recycler = await tx.recycler.create({
        data: {
          organizationId: org.id,
          name: d.name,
          cpcbRegistrationNo: d.cpcbRegistrationNo ?? null,
          stateCode: d.stateCode,
          city: d.city ?? null,
          contactEmail: d.contactEmail ?? null,
          contactPhone: d.contactPhone ?? null,
          verificationStatus: "UNVERIFIED",
        },
      });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "recycler.create", entityType: "Recycler", entityId: recycler.id, after: d });
    });
    revalidatePath(`/o/${orgSlug}/recyclers`);
    return { ok: true, message: `${d.name} added. Certificates from unverified recyclers are flagged until EPRFlow verifies them.` };
  } catch (error) {
    return handleActionError(error);
  }
}

/** One rating per person per recycler; rating again replaces the earlier one. */
export async function rateRecyclerAction(orgSlug: string, recyclerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (!ID.test(recyclerId)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "certificates.write");
    const parsed = ratingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const recycler = await db.recycler.findFirst({ where: { id: recyclerId }, select: { id: true } });
    if (!recycler) return { error: "This recycler is not in your directory." };

    await db.$transaction(async (tx) => {
      const rating = await tx.recyclerRating.upsert({
        where: { organizationId_recyclerId_userId: { organizationId: org.id, recyclerId, userId: user.id } },
        create: { organizationId: org.id, recyclerId, userId: user.id, rating: parsed.data.rating, comment: parsed.data.comment ?? null },
        update: { rating: parsed.data.rating, comment: parsed.data.comment ?? null },
      });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "recycler.rate", entityType: "RecyclerRating", entityId: rating.id, after: parsed.data });
    });
    revalidatePath(`/o/${orgSlug}/recyclers/${recyclerId}`);
    return { ok: true, message: "Thanks — your rating is saved." };
  } catch (error) {
    return handleActionError(error);
  }
}
