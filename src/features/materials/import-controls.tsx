"use client";

import { FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { commitImportAction, discardImportAction, uploadImportAction } from "./import-actions";

const MAX_MB = 5;

export function UploadForm({ orgSlug }: { orgSlug: string }) {
  const [state, onSubmit, pending] = useFormAction(uploadImportAction.bind(null, orgSlug), {} as ActionState);
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function check(file: File | undefined) {
    setClientError(null);
    setFileName(file?.name ?? null);
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) setClientError("Upload a .csv or .xlsx file");
    else if (file.size > MAX_MB * 1024 * 1024) setClientError(`The file is larger than ${MAX_MB} MB — split it into smaller files`);
  }

  return (
    <form
      onSubmit={(e) => {
        if (clientError) return e.preventDefault();
        onSubmit(e);
      }}
      noValidate
      className="grid gap-4"
    >
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormField label="Spreadsheet" htmlFor="file" error={clientError ?? state.fieldErrors?.file}>
        <label
          htmlFor="file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className={cn(
            "relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-brand-soft/30",
            dragging && "border-primary bg-brand-soft/40",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-primary">
            {fileName ? <FileSpreadsheetIcon className="size-6" /> : <UploadIcon className="size-6" />}
          </span>
          <span className="font-medium">{fileName ?? "Drop a file here or click to browse"}</span>
          <span className="text-xs text-muted-foreground">CSV or Excel (.xlsx), up to {MAX_MB} MB and 5,000 rows</span>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => check(e.target.files?.[0])}
          />
        </label>
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={!fileName || !!clientError}>
          Validate file
        </SubmitButton>
      </div>
    </form>
  );
}

export function BatchActions({ orgSlug, batchId, validRows }: { orgSlug: string; batchId: string; validRows: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionState>, after: string) {
    startTransition(async () => {
      const r = await action();
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.message);
        router.push(after);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Discard this import? Nothing will be saved.")) {
            run(() => discardImportAction(orgSlug, batchId), `/o/${orgSlug}/materials/import`);
          }
        }}
      >
        Discard
      </Button>
      <Button
        disabled={pending || validRows === 0}
        onClick={() => run(() => commitImportAction(orgSlug, batchId), `/o/${orgSlug}/materials?source=IMPORT`)}
      >
        {pending ? "Importing…" : `Import ${validRows} valid row${validRows === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
