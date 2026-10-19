import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrgContext } from "@/lib/auth/session";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { InviteMemberForm, MemberActions, RevokeInviteButton } from "./member-controls";

export const metadata: Metadata = { title: "Members" };

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function MembersPage({ params }: PageProps<"/o/[orgSlug]/settings/members">) {
  const { orgSlug } = await params;
  const { db, user, can } = await getOrgContext(orgSlug);
  const canManage = can("members.manage");

  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    canManage
      ? db.invitation.findMany({ where: { acceptedAt: null }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title="Members" description="People who can access this organization and what they can do." />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a team member</CardTitle>
            <CardDescription>
              Admins manage members and approve certificate purchases. Compliance managers and consultants enter
              data and manage certificates. Viewers have read-only access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm orgSlug={orgSlug} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {canManage && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">
                      {m.user.name ?? "—"} {m.user.id === user.id && <Badge variant="secondary">You</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.user.email}</div>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[m.role as Role]}</TableCell>
                  <TableCell className="text-muted-foreground">{dateFormat.format(m.createdAt)}</TableCell>
                  {canManage && (
                    <TableCell>
                      <MemberActions orgSlug={orgSlug} membershipId={m.id} role={m.role as Role} isSelf={m.user.id === user.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{ROLE_LABELS[inv.role as Role]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.expiresAt < new Date() ? <Badge variant="outline">Expired</Badge> : dateFormat.format(inv.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeInviteButton orgSlug={orgSlug} invitationId={inv.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
