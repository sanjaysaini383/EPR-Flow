"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { formatInr } from "@/lib/format";
import { saveBudgetAction } from "../actions";

export function BudgetForm({
  orgSlug,
  years,
  defaultYear,
  existing,
}: {
  orgSlug: string;
  years: string[];
  defaultYear: string;
  existing: Record<string, number>;
}) {
  const [state, onSubmit, pending] = useFormAction(saveBudgetAction.bind(null, orgSlug), {} as ActionState);
  const [fy, setFy] = useState(defaultYear);
  const [amount, setAmount] = useState(existing[defaultYear] ? String(existing[defaultYear]) : "");

  useEffect(() => {
    if (state.ok) toast.success(state.message);
  }, [state]);

  const parsed = Number(amount.replace(/[,\s]/g, ""));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-start">
      <div className="sm:col-span-3">
        <FormError message={state.fieldErrors ? undefined : state.error} />
      </div>
      <FormField label="Financial year" htmlFor="budget-fy" error={state.fieldErrors?.financialYear}>
        <Select
          name="financialYear"
          value={fy}
          onValueChange={(v) => {
            setFy(v);
            setAmount(existing[v] ? String(existing[v]) : "");
          }}
        >
          <SelectTrigger id="budget-fy" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                FY {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        label="Budget (₹)"
        htmlFor="budget-amount"
        error={state.fieldErrors?.amount}
        hint={Number.isFinite(parsed) && parsed > 0 ? formatInr(parsed) : "Total for EPR certificates this year"}
      >
        <Input id="budget-amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <SubmitButton pending={pending} className="sm:mt-[22px]">
        Save budget
      </SubmitButton>
    </form>
  );
}
