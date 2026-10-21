"use client";

import { PlusIcon, StarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { INDIAN_STATES } from "@/lib/domain/states";
import { cn } from "@/lib/utils";
import { addRecyclerAction, rateRecyclerAction } from "./actions";

function AddTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" {...props}>
      <PlusIcon /> Add recycler
    </Button>
  );
}

export function AddRecyclerDialog({ orgSlug }: { orgSlug: string }) {
  const [stateCode, setStateCode] = useState("");
  return (
    <RecordDialog
      trigger={<AddTrigger />}
      title="Add a recycler"
      description="For a recycler that is not in the EPRFlow directory yet. It is visible only to your organisation and stays unverified until EPRFlow checks the CPCB register."
      submitLabel="Add recycler"
      action={addRecyclerAction.bind(null, orgSlug)}
    >
      {(errors) => (
        <>
          <FormField label="Name" htmlFor="recycler-name" error={errors?.name} required>
            <Input id="recycler-name" name="name" maxLength={160} autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="CPCB registration no." htmlFor="recycler-reg" error={errors?.cpcbRegistrationNo}>
              <Input id="recycler-reg" name="cpcbRegistrationNo" maxLength={60} className="font-mono" />
            </FormField>
            <FormField label="State" htmlFor="recycler-state" error={errors?.stateCode} required>
              <Select name="stateCode" value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger id="recycler-state" className="w-full">
                  <SelectValue placeholder="Select state">{INDIAN_STATES.find((s) => s.code === stateCode)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="City" htmlFor="recycler-city" error={errors?.city}>
              <Input id="recycler-city" name="city" maxLength={80} />
            </FormField>
            <FormField label="Contact phone" htmlFor="recycler-phone" error={errors?.contactPhone}>
              <Input id="recycler-phone" name="contactPhone" inputMode="tel" maxLength={20} />
            </FormField>
          </div>
          <FormField label="Contact email" htmlFor="recycler-email" error={errors?.contactEmail}>
            <Input id="recycler-email" name="contactEmail" type="email" maxLength={160} />
          </FormField>
        </>
      )}
    </RecordDialog>
  );
}

/** Star rating with a real radio group underneath, so it works with keyboard and screen readers. */
export function RatingForm({ orgSlug, recyclerId, current }: { orgSlug: string; recyclerId: string; current?: { rating: number; comment: string | null } }) {
  const [state, onSubmit, pending] = useFormAction(rateRecyclerAction.bind(null, orgSlug, recyclerId), {} as ActionState);
  const [rating, setRating] = useState(current?.rating ?? 0);
  useEffect(() => {
    if (state.ok) toast.success(state.message);
  }, [state]);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <StarIcon
                aria-hidden
                className={cn("size-6 rounded transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring", n <= rating ? "fill-status-warning text-status-warning" : "text-muted-foreground")}
              />
              <span className="sr-only">
                {n} star{n === 1 ? "" : "s"}
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.rating && <p className="mt-1 text-sm text-destructive">{state.fieldErrors.rating[0]}</p>}
      </fieldset>
      <FormField label="Comment" htmlFor="rating-comment" error={state.fieldErrors?.comment}>
        <Textarea id="rating-comment" name="comment" rows={2} maxLength={500} defaultValue={current?.comment ?? undefined} placeholder="Delivery on time? Documents in order?" />
      </FormField>
      <div>
        <SubmitButton pending={pending} size="sm">
          {current ? "Update rating" : "Save rating"}
        </SubmitButton>
      </div>
    </form>
  );
}
