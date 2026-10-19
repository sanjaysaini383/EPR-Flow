"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { fieldErrors, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { slugify } from "@/lib/domain/slug";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/organization";

async function uniqueSlug(name: string) {
  const base = slugify(name) || "company";
  if (!(await prisma.organization.findUnique({ where: { slug: base }, select: { id: true } }))) return base;
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Creates the organization and makes the current user its Admin. Uses the base client: no tenant exists yet. */
export async function createOrganizationAction(input: OnboardingInput): Promise<ActionState> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { gstins, brands, ...details } = parsed.data;

  const slug = await uniqueSlug(details.name);
  const org = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        ...details,
        slug,
        onboardingCompletedAt: new Date(),
        memberships: { create: { userId: user.id, role: "ADMIN" } },
        gstRegistrations: { create: gstins.map((g) => ({ gstin: g.gstin, stateCode: g.stateCode })) },
        brands: { create: brands.map((name) => ({ name })) },
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { lastActiveOrgId: org.id } });
    await audit(tx, {
      organizationId: org.id,
      actorId: user.id,
      action: "organization.create",
      entityType: "Organization",
      entityId: org.id,
      after: { ...details, gstins: gstins.map((g) => g.gstin), brands },
    });
    return org;
  });

  redirect(`/o/${org.slug}/dashboard`);
}
