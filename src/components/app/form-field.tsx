import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { cloneElement, isValidElement, useId } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label + control + inline error/hint. When there is an error the control gets
 * aria-invalid (red outline) and aria-describedby pointing at the message, so the
 * problem is visible and announced by screen readers.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string[] | string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  const messageId = useId();
  const describedBy = message || hint ? messageId : undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        "aria-invalid": message ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className={cn("grid content-start gap-1.5", className)} data-invalid={message ? "" : undefined}>
      <Label htmlFor={htmlFor} className={cn(message && "text-destructive")}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {control}
      {message ? (
        <p id={messageId} className="flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          {message}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error banner, announced to assistive tech. */
export function FormError({ message, title = "Something needs your attention" }: { message?: string; title?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert" aria-live="assertive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert role="status" className="border-success/40 text-success">
      <CheckCircle2Icon />
      <AlertDescription className="text-success">{message}</AlertDescription>
    </Alert>
  );
}
