"use client";

import { GaugeIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/app/form-field";
import { RecordDialog } from "@/components/app/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/domain/states";
import { saveCapacityAction, saveRecyclerAction } from "./actions";

export type AdminRecycler = {
  id: string;
  name: string;
  cpcbRegistrationNo: string;
  stateCode: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  verificationStatus: string;
  registrationValidFrom: string;
  registrationValidTo: string;
};

const STATUSES = [
  { value: "VERIFIED", label: "Verified" },
  { value: "PENDING", label: "Verification pending" },
  { value: "UNVERIFIED", label: "Unverified" },
  { value: "SUSPENDED", label: "Suspended" },
];

function NewTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button {...props}>
      <PlusIcon /> Add recycler
    </Button>
  );
}
function EditTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" {...props}>
      <PencilIcon /> Edit
    </Button>
  );
}
function CapacityTrigger(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" {...props}>
      <GaugeIcon /> Capacity
    </Button>
  );
}

export function RecyclerDialog({ recycler }: { recycler?: AdminRecycler }) {
  const [stateCode, setStateCode] = useState(recycler?.stateCode ?? "");
  const [status, setStatus] = useState(recycler?.verificationStatus ?? "PENDING");
  return (
    <RecordDialog
      trigger={recycler ? <EditTrigger /> : <NewTrigger />}
      title={recycler ? `Edit ${recycler.name}` : "Add a platform recycler"}
      description="Check the registration against the CPCB centralised EPR portal before marking a recycler verified."
      submitLabel="Save"
      action={saveRecyclerAction.bind(null, recycler?.id ?? null)}
    >
      {(errors) => (
        <>
          <FormField label="Name" htmlFor="ar-name" error={errors?.name} required>
            <Input id="ar-name" name="name" defaultValue={recycler?.name} maxLength={160} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="CPCB registration no." htmlFor="ar-reg" error={errors?.cpcbRegistrationNo}>
              <Input id="ar-reg" name="cpcbRegistrationNo" defaultValue={recycler?.cpcbRegistrationNo} className="font-mono" />
            </FormField>
            <FormField label="Status" htmlFor="ar-status" error={errors?.verificationStatus} required>
              <Select name="verificationStatus" value={status} onValueChange={setStatus}>
                <SelectTrigger id="ar-status" className="w-full">
                  <SelectValue>{STATUSES.find((s) => s.value === status)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Registration valid from" htmlFor="ar-from" error={errors?.registrationValidFrom}>
              <Input id="ar-from" name="registrationValidFrom" type="date" defaultValue={recycler?.registrationValidFrom} />
            </FormField>
            <FormField label="Registration valid to" htmlFor="ar-to" error={errors?.registrationValidTo}>
              <Input id="ar-to" name="registrationValidTo" type="date" defaultValue={recycler?.registrationValidTo} />
            </FormField>
            <FormField label="State" htmlFor="ar-state" error={errors?.stateCode} required>
              <Select name="stateCode" value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger id="ar-state" className="w-full">
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
            <FormField label="City" htmlFor="ar-city" error={errors?.city}>
              <Input id="ar-city" name="city" defaultValue={recycler?.city} />
            </FormField>
            <FormField label="Contact email" htmlFor="ar-email" error={errors?.contactEmail}>
              <Input id="ar-email" name="contactEmail" type="email" defaultValue={recycler?.contactEmail} />
            </FormField>
            <FormField label="Contact phone" htmlFor="ar-phone" error={errors?.contactPhone}>
              <Input id="ar-phone" name="contactPhone" defaultValue={recycler?.contactPhone} />
            </FormField>
          </div>
        </>
      )}
    </RecordDialog>
  );
}

export function CapacityDialog({ recyclerId, name, categories, years }: { recyclerId: string; name: string; categories: { id: string; name: string }[]; years: string[] }) {
  const [categoryId, setCategoryId] = useState("");
  const [fy, setFy] = useState(years[0]);
  return (
    <RecordDialog
      trigger={<CapacityTrigger />}
      title={`Capacity — ${name}`}
      description="Registered annual processing capacity. Certificates issued beyond it (across all buyers) are flagged as high severity."
      submitLabel="Save capacity"
      action={saveCapacityAction.bind(null, recyclerId)}
    >
      {(errors) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Category" htmlFor="cap-cat" error={errors?.categoryId} required>
            <Select name="categoryId" value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="cap-cat" className="w-full">
                <SelectValue placeholder="Select">{categories.find((c) => c.id === categoryId)?.name.split(" – ")[0]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Financial year" htmlFor="cap-fy" error={errors?.financialYear} required>
            <Select name="financialYear" value={fy} onValueChange={setFy}>
              <SelectTrigger id="cap-fy" className="w-full">
                <SelectValue>FY {fy}</SelectValue>
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
          <FormField label="Capacity (tonnes)" htmlFor="cap-t" error={errors?.capacityTonnes} required>
            <Input id="cap-t" name="capacityTonnes" inputMode="decimal" />
          </FormField>
        </div>
      )}
    </RecordDialog>
  );
}
