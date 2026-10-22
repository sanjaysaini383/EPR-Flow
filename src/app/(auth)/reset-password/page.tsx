import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>You&apos;ll be signed out on every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              This reset link is incomplete. Open the link from the email again, or request a new one.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
