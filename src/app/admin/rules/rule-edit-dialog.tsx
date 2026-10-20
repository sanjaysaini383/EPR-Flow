"use client";

import { PencilIcon } from "lucide-react";
import { FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRuleVersionAction } from "../actions";

type RuleView = {
  id: string;
  label: string;
  value: string;
  unit: string;
  parameters: string;
  sourceReference: string;
  notes: string;
  isVerified: boolean;
  version: number;
};

function EditTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" {...props}>
      <PencilIcon /> Edit
    </Button>
  );
}

export function RuleEditDialog({ rule }: { rule: RuleView }) {
  return (
    <RecordDialog
      trigger={<EditTrigger />}
      title={`New version of ${rule.label}`}
      description={`Saving creates v${rule.version + 1}. Past calculations keep referring to v${rule.version}.`}
      submitLabel={`Save v${rule.version + 1}`}
      action={saveRuleVersionAction.bind(null, rule.id)}
    >
      {(errors) => (
        <>
          <FormField
            label={rule.unit === "PERCENT" ? "Value (%)" : rule.unit === "INR_PER_KG" ? "Value (₹ per kg)" : "Value"}
            htmlFor="rule-value"
            error={errors?.value}
            required
          >
            <Input id="rule-value" name="value" inputMode="decimal" defaultValue={rule.value} autoFocus />
          </FormField>
          {rule.parameters && (
            <FormField label="Parameters (JSON)" htmlFor="rule-params" error={errors?.parameters} hint='e.g. {"baseMethod":"AVERAGE_PREVIOUS_YEARS","lookbackYears":2}'>
              <Textarea id="rule-params" name="parameters" rows={3} defaultValue={rule.parameters} className="font-mono text-xs" />
            </FormField>
          )}
          <FormField label="Source (notification / gazette reference)" htmlFor="rule-source" error={errors?.sourceReference}>
            <Input id="rule-source" name="sourceReference" defaultValue={rule.sourceReference} />
          </FormField>
          <FormField label="Notes" htmlFor="rule-notes" error={errors?.notes}>
            <Textarea id="rule-notes" name="notes" rows={2} defaultValue={rule.notes} />
          </FormField>
          <Label className="flex items-start gap-2 font-normal">
            <Checkbox name="isVerified" defaultChecked={rule.isVerified} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span>Verified against the latest CPCB notification</span>
              <span className="text-xs text-muted-foreground">Removes the “placeholder” warning shown to organisations.</span>
            </span>
          </Label>
        </>
      )}
    </RecordDialog>
  );
}
