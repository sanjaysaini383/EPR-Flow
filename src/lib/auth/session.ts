import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import { getTenantDb } from "@/lib/db/tenant";
import { can, type Permission, type Role } from "@/lib/domain/permissions";

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

/** Current user or null. De-duplicated per request. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, isPlatformAdmin: true, lastActiveOrgId: true },
  });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(callbackUrl?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  return user;
}

/**
 * Resolves the organization from its URL slug and checks the user is a member.
 * Non-members get a 404 (not 403) so org slugs cannot be probed.
 */
export const getOrgContext = cache(async (orgSlug: string) => {
  const user = await requireUser();
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organization: { slug: orgSlug, deletedAt: null } },
    include: { organization: true },
  });
  if (!membership) notFound();

  const { organization: org, role } = membership;
  return {
    user,
    org,
    role: role as Role,
    db: getTenantDb(org.id),
    can: (permission: Permission) => can(role as Role, permission),
  };
});

export type OrgContext = Awaited<ReturnType<typeof getOrgContext>>;

/** For server actions: resolve the org and assert a permission, or throw ForbiddenError. */
export async function requirePermission(orgSlug: string, permission: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.can(permission)) throw new ForbiddenError();
  return ctx;
}

export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: { organization: { select: { id: true, slug: true, name: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  return memberships.map((m) => ({ ...m.organization, role: m.role as Role }));
}

/** Remembers the org the user last opened so /o can send them back there. */
export async function rememberActiveOrg(user: CurrentUser, orgId: string) {
  if (user.lastActiveOrgId !== orgId) {
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveOrgId: orgId } });
  }
}

/** Platform administrators (EPRFlow staff) only; everyone else gets a 404. */
export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin/rules");
  if (!user.isPlatformAdmin) notFound();
  return user;
}
