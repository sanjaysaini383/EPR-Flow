"use client";

import { FileCheck2Icon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { financialYearOf } from "@/lib/domain/financial-year";
import { INDIAN_STATES } from "@/lib/domain/states";
import { parseNumber, toKg } from "@/lib/domain/units";
import { saveCertificateAction } from "./actions";

export type CertificateFormOptions = {
  recyclers: { id: string; name: string; registrationNo: string | null; stateCode: string; status: string; own: boolean }[];
  categories: { id: string; name: string }[];
  years: string[];
};

export type CertificateDefaults = {
  certificateNumber?: string;
  recyclerId?: string;
  categoryId?: string;
  type?: string;
  financialYear?: string;
  stateCode?: string | null;
  quantity?: string;
  issueDate?: string;
  transferDate?: string | null;
  cost?: string | null;
  notes?: string | null;
  fileName?: string | null;
};

const STATUS_NOTE: Record<string, string> = { VERIFIED: "verified", UNVERIFIED: "unverified", PENDING: "verification pending", SUSPENDED: "suspended" };
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function CertificateForm({
  orgSlug,
  certificateId,
  options,
  defaults,
  today,
  extractionId,
}: {
  orgSlug: string;
  certificateId?: string;
  options: CertificateFormOptions;
  defaults: CertificateDefaults;
  today: string;
  /** Set on the AI review screen: the extracted document is attached automatically. */
  extractionId?: string;
}) {
  const [state, onSubmit, pending] = useFormAction(saveCertificateAction.bind(null, orgSlug, certificateId ?? null), {} as ActionState);
  const e = state.fieldErrors;

  const [recyclerId, setRecyclerId] = useState(defaults.recyclerId ?? "");
  const [categoryId, setCategoryId] = useState(defaults.categoryId ?? "");
  const [type, setType] = useState(defaults.type ?? "RECYCLING");
  const [fy, setFy] = useState(defaults.financialYear ?? options.years[0]);
  const [fyTouched, setFyTouched] = useState(Boolean(defaults.financialYear));
  const [stateCode, setStateCode] = useState(defaults.stateCode ?? "none");
  const [unit, setUnit] = useState<"kg" | "tonne">("kg");
  const [quantity, setQuantity] = useState(defaults.quantity ?? "");
  const [cost, setCost] = useState(defaults.cost ?? "");

  const qty = parseNumber(quantity);
  const kg = qty === null ? null : toKg(qty, unit);
  const rupees = parseNumber(cost);
  const perKg = kg && rupees !== null && kg > 0 ? rupees / kg : null;
  const recycler = options.recyclers.find((r) => r.id === recyclerId);
  const platform = options.recyclers.filter((r) => !r.own);
  const own = options.recyclers.filter((r) => r.own);

  return (
    <form onSubmit={onSubmit} noValidate encType="multipart/form-data">
      <Card>
        <CardContent className="grid gap-6">
          <FormError message={state.error} />
          {extractionId && <input type="hidden" name="extractionId" value={extractionId} />}

          <section className="grid gap-4 sm:grid-cols-2">
            <FormField label="Certificate number" htmlFor="certificateNumber" error={e?.certificateNumber} required hint="As printed on the certificate">
              <Input id="certificateNumber" name="certificateNumber" defaultValue={defaults.certificateNumber} maxLength={60} autoComplete="off" className="font-mono" />
            </FormField>
            <FormField label="Recycler / processor" htmlFor="recyclerId" error={e?.recyclerId} required hint={recycler && recycler.status !== "VERIFIED" ? `This recycler is ${STATUS_NOTE[recycler.status]} — the certificate will be flagged.` : undefined}>
              <Select name="recyclerId" value={recyclerId} onValueChange={setRecyclerId}>
                <SelectTrigger id="recyclerId" className="w-full">
                  <SelectValue placeholder="Select recycler">{recycler?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>EPRFlow directory</SelectLabel>
                    {platform.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} <span className="text-muted-foreground">· {r.registrationNo ?? r.stateCode}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {own.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Added by your team</SelectLabel>
                      {own.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} <span className="text-muted-foreground">· {STATUS_NOTE[r.status]}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Category" htmlFor="categoryId" error={e?.categoryId} required>
              <Select name="categoryId" value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Select category">{options.categories.find((c) => c.id === categoryId)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Type" htmlFor="type" error={e?.type} required hint="End-of-life (e.g. co-processing) counts only beyond the minimum recycling share">
              <Select name="type" value={type} onValueChange={setType}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue>{type === "END_OF_LIFE" ? "End of life" : "Recycling"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECYCLING">Recycling</SelectItem>
                  <SelectItem value="END_OF_LIFE">End of life</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <FormField label="Issue date" htmlFor="issueDate" error={e?.issueDate} required>
              <Input
                id="issueDate"
                name="issueDate"
                type="date"
                max={today}
                defaultValue={defaults.issueDate}
                onChange={(ev) => {
                  if (!fyTouched && ev.target.value) setFy(financialYearOf(new Date(`${ev.target.value}T00:00:00Z`)));
                }}
              />
            </FormField>
            <FormField label="Financial year" htmlFor="financialYear" error={e?.financialYear} required hint="The year this certificate counts towards">
              <Select
                name="financialYear"
                value={fy}
                onValueChange={(v) => {
                  setFy(v);
                  setFyTouched(true);
                }}
              >
                <SelectTrigger id="financialYear" className="w-full">
                  <SelectValue>FY {fy}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.years.map((y) => (
                    <SelectItem key={y} value={y}>
                      FY {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Transfer date" htmlFor="transferDate" error={e?.transferDate} hint="When it was transferred to you on the portal">
              <Input id="transferDate" name="transferDate" type="date" max={today} defaultValue={defaults.transferDate ?? undefined} />
            </FormField>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <FormField label="Quantity" htmlFor="quantity" error={e?.quantity ?? e?.unit} required hint={kg !== null && unit === "tonne" ? `${inr.format(kg)} kg` : undefined}>
              <div className="flex gap-2">
                <Input id="quantity" name="quantity" inputMode="decimal" value={quantity} onChange={(ev) => setQuantity(ev.target.value)} placeholder="e.g. 25.5" />
                <Select name="unit" value={unit} onValueChange={(v) => setUnit(v as "kg" | "tonne")}>
                  <SelectTrigger aria-label="Unit" className="w-28">
                    <SelectValue>{unit === "kg" ? "kg" : "tonnes"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="tonne">tonnes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FormField>
            <FormField label="Amount paid (₹)" htmlFor="cost" error={e?.cost} hint={perKg !== null ? `₹${perKg.toFixed(2)} per kg` : "Optional — used for budgets and price checks"}>
              <Input id="cost" name="cost" inputMode="decimal" value={cost} onChange={(ev) => setCost(ev.target.value)} placeholder="e.g. 250000" />
            </FormField>
            <FormField label="State" htmlFor="stateCode" error={e?.stateCode} hint="If the certificate is state-specific">
              <Select name="stateCode" value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger id="stateCode" className="w-full">
                  <SelectValue>{stateCode === "none" ? "Not state-specific" : INDIAN_STATES.find((s) => s.code === stateCode)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not state-specific</SelectItem>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Certificate file"
              htmlFor="file"
              error={e?.file}
              hint={
                defaults.fileName
                  ? `Attached: ${defaults.fileName}. Choose a file to replace it.`
                  : extractionId
                    ? "The uploaded document is attached automatically."
                    : "PDF, PNG or JPEG, up to 4 MB. Checked for duplicates."
              }
            >
              <Input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" />
            </FormField>
            <FormField label="Notes" htmlFor="notes" error={e?.notes}>
              <Textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={defaults.notes ?? undefined} />
            </FormField>
          </section>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-2 border-t">
          <Button asChild variant="ghost">
            <Link href={certificateId ? `/o/${orgSlug}/certificates/${certificateId}` : `/o/${orgSlug}/certificates`}>Cancel</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="outline" name="intent" value="draft" pending={pending}>
              <FileCheck2Icon /> Save draft
            </SubmitButton>
            <SubmitButton name="intent" value="submit" pending={pending}>
              <SendIcon /> Submit for approval
            </SubmitButton>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
