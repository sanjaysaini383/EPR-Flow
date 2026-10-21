"use client";

import { CheckIcon, MessageCircleIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_REMINDER_DAYS, REMINDER_DAY_OPTIONS } from "@/lib/domain/deadlines/schedule";
import { deleteDeadlineAction, saveDeadlineAction, setDeadlineDoneAction } from "./actions";

export type DeadlineFormValues = {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  reminderDays: number[];
  statutory: boolean;
};

const reminderLabel = (d: number) => (d === 0 ? "On the day" : d === 1 ? "1 day before" : `${d} days before`);

function AddTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button {...props}>
      <PlusIcon /> Add deadline
    </Button>
  );
}

function EditTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Edit deadline" {...props}>
      <PencilIcon />
    </Button>
  );
}

/** Add a custom deadline, or edit one. Statutory deadlines only expose their reminder settings. */
export function DeadlineDialog({ orgSlug, deadline, defaultDate }: { orgSlug: string; deadline?: DeadlineFormValues; defaultDate?: string }) {
  const statutory = deadline?.statutory ?? false;
  const reminderDays = deadline?.reminderDays ?? DEFAULT_REMINDER_DAYS;
  return (
    <RecordDialog
      trigger={deadline ? <EditTrigger /> : <AddTrigger />}
      title={deadline ? (statutory ? "Reminder settings" : "Edit deadline") : "Add a deadline"}
      description={
        statutory
          ? `${deadline?.title}. The date comes from the regulation rules; you can choose when reminders are emailed.`
          : "Internal deadlines — e.g. a board review or a certificate purchase cut-off. Admins and Compliance Managers get email reminders."
      }
      submitLabel={deadline ? "Save" : "Add deadline"}
      action={saveDeadlineAction.bind(null, orgSlug, deadline?.id ?? null)}
    >
      {(errors) => (
        <>
          {!statutory && (
            <>
              <FormField label="Title" htmlFor="deadline-title" error={errors?.title} required>
                <Input id="deadline-title" name="title" defaultValue={deadline?.title} maxLength={120} placeholder="e.g. Q3 certificate purchase review" autoFocus />
              </FormField>
              <FormField label="Due date" htmlFor="deadline-date" error={errors?.dueDate} required>
                <Input id="deadline-date" name="dueDate" type="date" defaultValue={deadline?.dueDate ?? defaultDate} className="w-48" />
              </FormField>
              <FormField label="Notes" htmlFor="deadline-notes" error={errors?.description}>
                <Textarea id="deadline-notes" name="description" rows={2} maxLength={500} defaultValue={deadline?.description} />
              </FormField>
            </>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Email reminders</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REMINDER_DAY_OPTIONS.map((d) => (
                <Label key={d} className="flex items-center gap-2 font-normal">
                  <Checkbox name="reminderDays" value={String(d)} defaultChecked={reminderDays.includes(d)} />
                  {reminderLabel(d)}
                </Label>
              ))}
            </div>
            {errors?.reminderDays && <p className="text-sm text-destructive">{errors.reminderDays[0]}</p>}
          </fieldset>
        </>
      )}
    </RecordDialog>
  );
}

/** Row actions: done / reopen, edit, share on WhatsApp, delete (custom deadlines only). */
export function DeadlineActions({
  orgSlug,
  deadline,
  done,
  whatsappLink,
  canManage,
}: {
  orgSlug: string;
  deadline: DeadlineFormValues;
  done: boolean;
  whatsappLink: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await action();
      if (r.error) toast.error(r.error);
      else toast.success(r.message);
    });

  return (
    <div className="-ml-1 flex flex-wrap items-center gap-1 pt-1">
      {canManage && (
        <Button
          variant={done ? "ghost" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => run(() => setDeadlineDoneAction(orgSlug, deadline.id, !done))}
        >
          {done ? <RotateCcwIcon /> : <CheckIcon />}
          {done ? "Reopen" : "Mark done"}
        </Button>
      )}
      <Button asChild variant="ghost" size="icon-sm" aria-label="Share on WhatsApp" title="Share on WhatsApp">
        <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
          <MessageCircleIcon />
        </a>
      </Button>
      {canManage && !done && <DeadlineDialog orgSlug={orgSlug} deadline={deadline} />}
      {canManage && !deadline.statutory && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete deadline"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete “${deadline.title}”? Its reminders are cancelled.`)) run(() => deleteDeadlineAction(orgSlug, deadline.id));
          }}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}
