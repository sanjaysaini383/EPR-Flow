"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * useActionState wired through onSubmit instead of `<form action>`.
 * React resets uncontrolled inputs after a form action completes, which would wipe
 * what the user typed whenever the server returns validation errors. Submitting via
 * onSubmit keeps the inputs intact; call `form.reset()` yourself on success if needed.
 */
export function useFormAction<S>(action: (prev: Awaited<S>, formData: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Include the clicked submit button's name/value (e.g. intent=submit vs intent=draft).
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return [state, onSubmit, pending] as const;
}
