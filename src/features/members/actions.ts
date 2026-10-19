"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { appUrl, sendEmail } from "@/lib/email/send";
import { hashInviteToken, INVITE_TTL_DAYS } from "@/lib/invitations";
import { changeRoleSchema, inviteMemberSchema } from "@/lib/validation/organization";

export type InviteState = ActionState & { inviteUrl?: string };

export async function inviteMemberAction(orgSlug: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "members.manage");
    const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const { email, role } = parsed.data;

    const existingMember = await db.membership.findFirst({ where: { user: { email } }, select: { id: true } });
    if (existingMember) return { fieldErrors: { email: ["This person is already a member."] } };

    const token = randomBytes(32).toString("base64url");
    const invitation = await db.$transaction(async (tx) => {
      await tx.invitation.deleteMany({ where: { email, acceptedAt: null } });
      const invitation = await tx.invitation.create({
        data: {
          organizationId: org.id,
          email,
          role,
          tokenHash: hashInviteToken(token),
          invitedById: user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        },
      });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "member.invite",
        entityType: "Invitation",
        entityId: invitation.id,
        after: { email, role },
      });
      return invitation;
    });

    const inviteUrl = appUrl(`/invite/${token}`);
    const sent = await sendEmail({
      to: email,
      subject: `${user.name ?? user.email} invited you to ${org.name} on EPRFlow`,
      text: [
        `You have been invited to join ${org.name} on EPRFlow as ${ROLE_LABELS[invitation.role]}.`,
        "",
        `Accept the invitation: ${inviteUrl}`,
        "",
        `This link expires in ${INVITE_TTL_DAYS} days.`,
      ].join("\n"),
    });

    revalidatePath(`/o/${orgSlug}/settings/members`);
    return {
      ok: true,
      message: sent ? `Invitation emailed to ${email}.` : `Invitation created. Email is not configured — share the link below.`,
      inviteUrl,
    };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function revokeInvitationAction(orgSlug: string, invitationId: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "members.manage");
    await db.$transaction(async (tx) => {
      const { count } = await tx.invitation.deleteMany({ where: { id: invitationId, acceptedAt: null } });
      if (count > 0) {
        await audit(tx, {
          organizationId: org.id,
          actorId: user.id,
          action: "member.invite_revoke",
          entityType: "Invitation",
          entityId: invitationId,
        });
      }
    });
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { ok: true, message: "Invitation revoked." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function changeRoleAction(orgSlug: string, membershipId: string, role: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "members.manage");
    const parsed = changeRoleSchema.safeParse({ membershipId, role });
    if (!parsed.success) return { error: "Invalid role." };

    return await db.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!membership) return { error: "Member not found." };
      if (membership.role === "ADMIN" && parsed.data.role !== "ADMIN") {
        const admins = await tx.membership.count({ where: { role: "ADMIN" } });
        if (admins <= 1) return { error: "An organization needs at least one admin." };
      }
      await tx.membership.update({ where: { id: membershipId }, data: { role: parsed.data.role } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "member.role_change",
        entityType: "Membership",
        entityId: membershipId,
        before: { role: membership.role },
        after: { role: parsed.data.role },
      });
      revalidatePath(`/o/${orgSlug}/settings/members`);
      return { ok: true, message: "Role updated." };
    });
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeMemberAction(orgSlug: string, membershipId: string): Promise<ActionState> {
  try {
    const { db, org, user } = await requirePermission(orgSlug, "members.manage");
    return await db.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!membership) return { error: "Member not found." };
      if (membership.role === "ADMIN") {
        const admins = await tx.membership.count({ where: { role: "ADMIN" } });
        if (admins <= 1) return { error: "You cannot remove the last admin." };
      }
      await tx.membership.delete({ where: { id: membershipId } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: "member.remove",
        entityType: "Membership",
        entityId: membershipId,
        before: { userId: membership.userId, role: membership.role },
      });
      revalidatePath(`/o/${orgSlug}/settings/members`);
      return { ok: true, message: "Member removed." };
    });
  } catch (error) {
    return handleActionError(error);
  }
}

/** Accepting happens before the user is a member, so it uses the base client and checks the token itself. */
export async function acceptInvitationAction(token: string) {
  const user = await requireUser(`/invite/${token}`);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { organization: { select: { slug: true, deletedAt: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date() || invitation.organization.deletedAt) {
    redirect(`/invite/${token}`);
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) redirect(`/invite/${token}`);

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
      update: {},
      create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await audit(tx, {
      organizationId: invitation.organizationId,
      actorId: user.id,
      action: "member.join",
      entityType: "Invitation",
      entityId: invitation.id,
      after: { role: invitation.role },
    });
  });

  redirect(`/o/${invitation.organization.slug}/dashboard`);
}
