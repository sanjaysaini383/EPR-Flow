import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvitationAction } from "@/features/members/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { hashInviteToken } from "@/lib/invitations";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    prisma.invitation.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { organization: { select: { name: true, deletedAt: true } }, invitedBy: { select: { name: true } } },
    }),
    getCurrentUser(),
  ]);

  if (!invitation || invitation.organization.deletedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return (
      <Message title="Invitation not valid" description="This invitation has expired, was revoked or was already used. Ask your admin for a new one." />
    );
  }

  const callback = `/invite/${token}`;
  const heading = `Join ${invitation.organization.name}`;
  const description = `${invitation.invitedBy.name ?? "A colleague"} invited ${invitation.email} as ${ROLE_LABELS[invitation.role as Role]}.`;

  if (!user) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{heading}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2">
          <Button asChild className="w-full" size="lg">
            <Link href={`/signup?callbackUrl=${encodeURIComponent(callback)}&email=${encodeURIComponent(invitation.email)}`}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full" size="lg">
            <Link href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>I already have an account</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Message
        title="Wrong account"
        description={`This invitation is for ${invitation.email}, but you are logged in as ${user.email}. Log out and sign in with the invited email.`}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acceptInvitationAction.bind(null, token)}>
          <SubmitButton className="w-full" size="lg">
            Accept invitation
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function Message({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href="/o">Go to EPRFlow</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
