import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth/session";
import { safeCallbackUrl } from "@/lib/validation/auth";
import { AuthSwitch, GoogleButton, SignupForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { callbackUrl: raw, email } = await searchParams;
  const callbackUrl = safeCallbackUrl(raw, "");
  if (await getCurrentUser()) redirect(callbackUrl || "/o");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Start tracking EPR obligations, certificates and deadlines.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {googleEnabled && (
            <>
              <GoogleButton callbackUrl={callbackUrl || "/onboarding"} />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" /> or <Separator className="flex-1" />
              </div>
            </>
          )}
          <SignupForm callbackUrl={callbackUrl} defaultEmail={typeof email === "string" ? email : undefined} />
        </CardContent>
      </Card>
      <AuthSwitch mode="signup" callbackUrl={callbackUrl} />
    </div>
  );
}
