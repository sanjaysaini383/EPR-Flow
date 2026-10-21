"use client";

import { CheckIcon, RefreshCwIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { certificateTransitionAction, dismissFlagAction, rejectCertificateAction } from "./actions";

type Step = "submit" | "approve" | "recheck" | "delete";

const STEP: Record<Step, { label: string; icon: typeof CheckIcon; variant: "default" | "outline" | "ghost" | "destructive"; confirm?: string }> = {
  submit: { label: "Submit for approval", icon: SendIcon, variant: "default" },
  approve: { label: "Approve", icon: CheckIcon, variant: "default", confirm: "Approve this certificate? It will count towards your EPR targets." },
  recheck: { label: "Re-run checks", icon: RefreshCwIcon, variant: "outline" },
  delete: { label: "Delete draft", icon: Trash2Icon, variant: "ghost", confirm: "Delete this draft? This cannot be undone." },
};

export function TransitionButton({ orgSlug, id, step, disabled }: { orgSlug: string; id: string; step: Step; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const s = STEP[step];
  return (
    <Button
      variant={s.variant}
      size="sm"
      disabled={pending || disabled}
      onClick={() => {
        if (s.confirm && !confirm(s.confirm)) return;
        startTransition(async () => {
          const r = await certificateTransitionAction(orgSlug, id, step);
          if (r?.error) toast.error(r.error);
          else if (r?.message) toast.success(r.message);
        });
      }}
    >
      <s.icon className={pending && step === "recheck" ? "animate-spin" : undefined} />
      {s.label}
    </Button>
  );
}

function RejectTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" size="sm" {...props}>
      <XIcon /> Reject
    </Button>
  );
}

export function RejectDialog({ orgSlug, id }: { orgSlug: string; id: string }) {
  return (
    <RecordDialog
      trigger={<RejectTrigger />}
      title="Reject certificate"
      description="The submitter sees your reason and can correct and resubmit the certificate."
      submitLabel="Reject certificate"
      action={rejectCertificateAction.bind(null, orgSlug, id)}
    >
      {(errors) => (
        <FormField label="Reason" htmlFor="reject-reason" error={errors?.reason} required>
          <Textarea id="reject-reason" name="reason" rows={3} maxLength={500} placeholder="e.g. Quantity does not match the portal transfer" autoFocus />
        </FormField>
      )}
    </RecordDialog>
  );
}

function DismissTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" {...props}>
      Dismiss
    </Button>
  );
}

export function DismissFlagDialog({ orgSlug, flagId, message }: { orgSlug: string; flagId: string; message: string }) {
  return (
    <RecordDialog
      trigger={<DismissTrigger />}
      title="Dismiss flag"
      description={message}
      submitLabel="Dismiss with note"
      action={dismissFlagAction.bind(null, orgSlug, flagId)}
    >
      {(errors) => (
        <FormField label="Why is this not a problem?" htmlFor="dismiss-note" error={errors?.note} required hint="Kept in the audit trail">
          <Textarea id="dismiss-note" name="note" rows={3} maxLength={500} placeholder="e.g. Recycler confirmed by email on 12 Oct; registration renewal pending" autoFocus />
        </FormField>
      )}
    </RecordDialog>
  );
}
