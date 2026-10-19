"use client";

import Link from "next/link";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { googleSignInAction, loginAction, signupAction } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, onSubmit, pending] = useFormAction(loginAction, {} as ActionState);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <FormError message={state.error} />
      <FormField label="Work email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </FormField>
      <FormField label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <SubmitButton size="lg" className="w-full" pending={pending}>
        Log in
      </SubmitButton>
    </form>
  );
}

export function SignupForm({ callbackUrl, defaultEmail }: { callbackUrl?: string; defaultEmail?: string }) {
  const [state, onSubmit, pending] = useFormAction(signupAction, {} as ActionState);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <FormError message={state.error} />
      <FormField label="Full name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required autoFocus />
      </FormField>
      <FormField label="Work email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
      </FormField>
      <FormField
        label="Password"
        htmlFor="password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters, with a letter and a number."
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </FormField>
      <SubmitButton size="lg" className="w-full" pending={pending}>
        Create account
      </SubmitButton>
    </form>
  );
}

export function GoogleButton({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <Button type="submit" variant="outline" size="lg" className="w-full">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
        </svg>
        Continue with Google
      </Button>
    </form>
  );
}

export function AuthSwitch({ mode, callbackUrl }: { mode: "login" | "signup"; callbackUrl?: string }) {
  const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
  return mode === "login" ? (
    <p className="text-center text-sm text-muted-foreground">
      New to EPRFlow?{" "}
      <Link href={`/signup${query}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        Create an account
      </Link>
    </p>
  ) : (
    <p className="text-center text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link href={`/login${query}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        Log in
      </Link>
    </p>
  );
}
