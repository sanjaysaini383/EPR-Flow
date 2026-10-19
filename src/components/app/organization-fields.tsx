"use client";

import { FormField } from "@/components/app/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/domain/states";

const ENTITY_TYPE_OPTIONS = [
  { value: "PRODUCER", label: "Producer", hint: "Manufactures plastic packaging / products" },
  { value: "IMPORTER", label: "Importer", hint: "Imports packaging or packaged products" },
  { value: "BRAND_OWNER", label: "Brand Owner", hint: "Sells products under its own brand" },
];

const WASTE_STREAM_OPTIONS = [
  { value: "PLASTIC", label: "Plastic packaging" },
  { value: "EWASTE", label: "E-waste" },
  { value: "BATTERY", label: "Batteries" },
];

export type OrganizationDefaults = {
  name?: string;
  legalName?: string | null;
  entityTypes?: string[];
  wasteStreams?: string[];
  headOfficeState?: string | null;
  cpcbRegistrationNo?: string | null;
  pan?: string | null;
  cin?: string | null;
  registeredAddress?: string | null;
};

type Errors = Record<string, string[] | undefined> | undefined;

/** Uncontrolled organization detail inputs; read back with `readOrganizationForm`. */
export function OrganizationFields({
  defaults = {},
  errors,
  disabled,
}: {
  defaults?: OrganizationDefaults;
  errors?: Errors;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-5 sm:grid-cols-2">
      <FormField label="Company name" htmlFor="name" error={errors?.name} hint="How your team refers to it">
        <Input id="name" name="name" defaultValue={defaults.name} required />
      </FormField>
      <FormField label="Legal name" htmlFor="legalName" error={errors?.legalName}>
        <Input id="legalName" name="legalName" defaultValue={defaults.legalName ?? ""} />
      </FormField>

      <FormField label="Head office state" htmlFor="headOfficeState" error={errors?.headOfficeState}>
        <Select name="headOfficeState" defaultValue={defaults.headOfficeState ?? undefined} disabled={disabled}>
          <SelectTrigger id="headOfficeState" className="w-full">
            <SelectValue placeholder="Select state" />
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
      <FormField
        label="CPCB EPR registration no."
        htmlFor="cpcbRegistrationNo"
        error={errors?.cpcbRegistrationNo}
        hint="Optional — add once registered on the CPCB portal"
      >
        <Input id="cpcbRegistrationNo" name="cpcbRegistrationNo" defaultValue={defaults.cpcbRegistrationNo ?? ""} />
      </FormField>

      <CheckboxGroup
        label="Entity type"
        name="entityTypes"
        options={ENTITY_TYPE_OPTIONS}
        defaults={defaults.entityTypes ?? []}
        error={errors?.entityTypes}
      />
      <CheckboxGroup
        label="Waste streams covered"
        name="wasteStreams"
        options={WASTE_STREAM_OPTIONS}
        defaults={defaults.wasteStreams ?? ["PLASTIC"]}
        error={errors?.wasteStreams}
      />

      <FormField label="PAN" htmlFor="pan" error={errors?.pan}>
        <Input id="pan" name="pan" defaultValue={defaults.pan ?? ""} className="uppercase" maxLength={10} />
      </FormField>
      <FormField label="CIN" htmlFor="cin" error={errors?.cin}>
        <Input id="cin" name="cin" defaultValue={defaults.cin ?? ""} className="uppercase" maxLength={21} />
      </FormField>
      <FormField label="Registered address" htmlFor="registeredAddress" error={errors?.registeredAddress} className="sm:col-span-2">
        <Textarea id="registeredAddress" name="registeredAddress" rows={2} defaultValue={defaults.registeredAddress ?? ""} />
      </FormField>
    </fieldset>
  );
}

function CheckboxGroup({
  label,
  name,
  options,
  defaults,
  error,
}: {
  label: string;
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaults: string[];
  error?: string[];
}) {
  return (
    <div className="grid content-start gap-2">
      <span className="text-sm font-medium">{label}</span>
      {options.map((o) => (
        <Label key={o.value} className="flex items-start gap-2 font-normal">
          <Checkbox name={name} value={o.value} defaultChecked={defaults.includes(o.value)} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span>{o.label}</span>
            {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
          </span>
        </Label>
      ))}
      {error?.[0] && <p className="text-xs text-destructive">{error[0]}</p>}
    </div>
  );
}

export function readOrganizationForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    headOfficeState: String(formData.get("headOfficeState") ?? ""),
    cpcbRegistrationNo: String(formData.get("cpcbRegistrationNo") ?? ""),
    pan: String(formData.get("pan") ?? ""),
    cin: String(formData.get("cin") ?? ""),
    registeredAddress: String(formData.get("registeredAddress") ?? ""),
    entityTypes: formData.getAll("entityTypes").map(String),
    wasteStreams: formData.getAll("wasteStreams").map(String),
  } as const;
}
