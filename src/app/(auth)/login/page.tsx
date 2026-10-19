import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth/session";
import { safeCallbackUrl } from "@/lib/validation/auth";
import { AuthSwitch, GoogleButton, LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl: raw, error } = await searchParams;
  const callbackUrl = safeCallbackUrl(raw, "");
  if (await getCurrentUser()) redirect(callbackUrl || "/o");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Log in to manage your EPR compliance.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error === "OAuthAccountNotLinked" && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This email is already registered with a different sign-in method.
            </p>
          )}
          {googleEnabled && (
            <>
              <GoogleButton callbackUrl={callbackUrl} />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" /> or <Separator className="flex-1" />
              </div>
            </>
          )}
          <LoginForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>
      <AuthSwitch mode="login" callbackUrl={callbackUrl} />
    </div>
  );
}
