import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { FormError } from "@/components/app/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth/session";
import { safeCallbackUrl } from "@/lib/validation/auth";
import { AuthSwitch, GoogleButton, LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Log in" };

/** Auth.js redirects here with ?error=<code>; never echo the raw value back to the page. */
const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "This email is already registered with a different sign-in method. Log in with your password.",
  AccessDenied: "Access was denied. Please try again or use another account.",
  Configuration: "Sign-in is temporarily unavailable. Please try again shortly.",
  Default: "We couldn't sign you in. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl: raw, error, reset } = await searchParams;
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
          {reset === "1" && (
            <p role="status" className="rounded-lg border border-primary/30 bg-brand-soft/40 p-3 text-sm">
              Your password was changed. Log in with the new one.
            </p>
          )}
          <FormError message={typeof error === "string" ? (AUTH_ERRORS[error] ?? AUTH_ERRORS.Default) : undefined} title="Sign-in failed" />
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
