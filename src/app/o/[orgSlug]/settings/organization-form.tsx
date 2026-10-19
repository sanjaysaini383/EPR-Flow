"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form-field";
import { OrganizationFields, type OrganizationDefaults } from "@/components/app/organization-fields";
import { SubmitButton } from "@/components/app/submit-button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";

export function OrganizationSettingsForm({
  action,
  defaults,
  canEdit,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: OrganizationDefaults;
  canEdit: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction(action, {} as ActionState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardContent className="grid gap-4">
          <FormError message={state.error} />
          <OrganizationFields defaults={defaults} errors={state.fieldErrors} disabled={!canEdit} />
        </CardContent>
        <CardFooter className="justify-end">
          {canEdit ? (
            <SubmitButton pending={pending}>Save changes</SubmitButton>
          ) : (
            <p className="text-sm text-muted-foreground">Only admins can edit organization details.</p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
