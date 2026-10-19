"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { z } from "zod";
import { FormError, FormField } from "@/components/app/form-field";
import { OrganizationFields, readOrganizationForm } from "@/components/app/organization-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions";
import { validateGstin } from "@/lib/domain/gstin";
import { stateName } from "@/lib/domain/states";
import { cn } from "@/lib/utils";
import { organizationDetailsSchema, type OnboardingInput } from "@/lib/validation/organization";
import { createOrganizationAction } from "./actions";

const STEPS = ["Company", "GST registrations", "Brands"] as const;

type Details = ReturnType<typeof readOrganizationForm>;

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<Details | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string[] | undefined>>();
  const [gstins, setGstins] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readOrganizationForm(new FormData(event.currentTarget));
    const parsed = organizationDetailsSchema.safeParse(values);
    if (!parsed.success) {
      setDetailErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setDetailErrors(undefined);
    setDetails(values);
    setStep(1);
  }

  function finish() {
    if (!details) return setStep(0);
    const input: OnboardingInput = { ...details, gstins, brands } as OnboardingInput;
    startTransition(async () => {
      const res = await createOrganizationAction(input);
      if (res?.fieldErrors) {
        const companyFieldErrors = Object.keys(res.fieldErrors).some((k) => k !== "gstins" && k !== "brands");
        if (companyFieldErrors) {
          setDetailErrors(res.fieldErrors);
          setStep(0);
        }
      }
      setResult(res ?? {});
    });
  }

  return (
    <div className="grid gap-6">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
                i > step && "text-muted-foreground",
              )}
            >
              {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>

      <FormError message={result.error} />

      {/* Step 1 stays mounted (hidden) so the uncontrolled inputs keep their values when going back. */}
      <form onSubmit={submitDetails} className={cn(step !== 0 && "hidden")}>
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>Used on reports and CPCB return exports.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationFields errors={detailErrors} />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Continue</Button>
          </CardFooter>
        </Card>
      </form>

      {step === 1 && (
        <ListStep
          title="GST registrations"
          inputLabel="GSTIN"
          description="Add each GSTIN you invoice from. The state is detected automatically. You can skip this and add them later."
          placeholder="e.g. 27AAACD1234F1Z5"
          items={gstins}
          onChange={setGstins}
          validate={(value) => {
            const r = validateGstin(value);
            if (!r.valid) return { error: r.reason };
            if (gstins.includes(r.gstin)) return { error: "Already added" };
            return { value: r.gstin };
          }}
          renderItem={(g) => {
            const r = validateGstin(g);
            return (
              <>
                <span className="font-mono text-sm">{g}</span>
                {r.valid && <Badge variant="secondary">{stateName(r.stateCode)}</Badge>}
              </>
            );
          }}
          error={result.fieldErrors?.gstins}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <ListStep
          title="Brands"
          inputLabel="Brand name"
          description="Brands you sell under. Material data and reports can be split by brand."
          placeholder="e.g. FreshBite Snacks"
          items={brands}
          onChange={setBrands}
          validate={(value) => {
            const v = value.trim();
            if (!v) return { error: "Enter a brand name" };
            if (brands.some((b) => b.toLowerCase() === v.toLowerCase())) return { error: "Already added" };
            return { value: v };
          }}
          renderItem={(b) => <span className="text-sm">{b}</span>}
          error={result.fieldErrors?.brands}
          onBack={() => setStep(1)}
          onNext={finish}
          nextLabel="Create company"
          pending={pending}
        />
      )}
    </div>
  );
}

function ListStep({
  title,
  inputLabel,
  description,
  placeholder,
  items,
  onChange,
  validate,
  renderItem,
  error,
  onBack,
  onNext,
  nextLabel = "Continue",
  pending,
}: {
  title: string;
  inputLabel: string;
  description: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  validate: (value: string) => { value?: string; error?: string };
  renderItem: (item: string) => React.ReactNode;
  error?: string[];
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  pending?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string>();

  function add() {
    const r = validate(draft);
    if (r.error) return setDraftError(r.error);
    onChange([...items, r.value!]);
    setDraft("");
    setDraftError(undefined);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField label={inputLabel} htmlFor="list-input" error={draftError ?? error}>
          <div className="flex gap-2">
            <Input
              id="list-input"
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={add}>
              <PlusIcon /> Add
            </Button>
          </div>
        </FormField>
        {items.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2">{renderItem(item)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(items.filter((i) => i !== item))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing added yet.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={pending}>
          {items.length === 0 && nextLabel === "Continue" ? "Skip" : nextLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
