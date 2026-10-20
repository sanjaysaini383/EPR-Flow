"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";

type Errors = ActionState["fieldErrors"];

/**
 * Dialog wrapping a server-action form. Closes and toasts on success, keeps the
 * dialog open with inline errors otherwise. `children` receives the field errors.
 */
export function RecordDialog({
  trigger,
  title,
  description,
  submitLabel,
  action,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: (errors: Errors) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* Remount the form each time the dialog opens so stale errors are cleared. */}
        {open && (
          <RecordForm title={title} description={description} submitLabel={submitLabel} action={action} onDone={() => setOpen(false)}>
            {children}
          </RecordForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  title,
  description,
  submitLabel,
  action,
  onDone,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onDone: () => void;
  children: (errors: Errors) => React.ReactNode;
}) {
  const [state, onSubmit, pending] = useFormAction(action, {} as ActionState);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      onDoneRef.current();
    }
  }, [state]);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <div className="grid gap-4">{children(state.fieldErrors)}</div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
