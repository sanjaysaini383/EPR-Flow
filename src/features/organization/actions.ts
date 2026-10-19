"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { organizationDetailsSchema } from "@/lib/validation/organization";

export async function updateOrganizationAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "org.manage");
    const parsed = organizationDetailsSchema.safeParse({
      ...Object.fromEntries(formData),
      entityTypes: formData.getAll("entityTypes"),
      wasteStreams: formData.getAll("wasteStreams"),
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    // Optional fields cleared in the form must be stored as null, not left untouched.
    const d = parsed.data;
    const data = {
      ...d,
      legalName: d.legalName ?? null,
      cpcbRegistrationNo: d.cpcbRegistrationNo ?? null,
      pan: d.pan ?? null,
      cin: d.cin ?? null,
      registeredAddress: d.registeredAddress ?? null,
    };

    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: org.id }, data });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "organization.update",
        entityType: "Organization",
        entityId: org.id,
        before: org,
        after: data,
      });
    });

    revalidatePath(`/o/${orgSlug}`, "layout");
    return { ok: true, message: "Organization details saved." };
  } catch (error) {
    return handleActionError(error);
  }
}
