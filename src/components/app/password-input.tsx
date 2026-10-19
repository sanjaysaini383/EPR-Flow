"use client";

import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  onValueChange,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { onValueChange?: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        onChange={(e) => {
          props.onChange?.(e);
          onValueChange?.(e.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

const RULES = [
  { label: "10+ characters", test: (v: string) => v.length >= 10 },
  { label: "A letter", test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: "A number", test: (v: string) => /[0-9]/.test(v) },
];

/** Live checklist mirroring the server-side password rules. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.label} className={cn("flex items-center gap-1", ok ? "text-success" : "text-muted-foreground")}>
            {ok ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
