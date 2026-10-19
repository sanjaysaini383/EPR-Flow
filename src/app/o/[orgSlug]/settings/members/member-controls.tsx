"use client";

import { CopyIcon, MoreHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form-field";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  type InviteState,
} from "@/features/members/actions";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionState } from "@/lib/actions";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain/permissions";

function notify(result: ActionState) {
  if (result.error) toast.error(result.error);
  else if (result.message) toast.success(result.message);
}

export function InviteMemberForm({ orgSlug }: { orgSlug: string }) {
  const [state, onSubmit, pending] = useFormAction<InviteState>(inviteMemberAction.bind(null, orgSlug), {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="grid gap-4">
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-start">
        <FormField label="Email" htmlFor="invite-email" error={state.fieldErrors?.email}>
          <Input id="invite-email" name="email" type="email" placeholder="colleague@company.com" required />
        </FormField>
        <FormField label="Role" htmlFor="invite-role" error={state.fieldErrors?.role}>
          <Select name="role" defaultValue="COMPLIANCE_MANAGER">
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <SubmitButton className="sm:mt-[22px]" pending={pending}>Send invite</SubmitButton>
      </form>
      <FormError message={state.error} />
      {state.inviteUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <code className="flex-1 truncate text-xs">{state.inviteUrl}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(state.inviteUrl!);
              toast.success("Invite link copied");
            }}
          >
            <CopyIcon /> Copy link
          </Button>
        </div>
      )}
    </div>
  );
}

export function MemberActions({
  orgSlug,
  membershipId,
  role,
  isSelf,
}: {
  orgSlug: string;
  membershipId: string;
  role: Role;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Member actions" disabled={pending}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Change role</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={role}
          onValueChange={(value) =>
            startTransition(async () => notify(await changeRoleAction(orgSlug, membershipId, value)))
          }
        >
          {ROLES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (!confirm(isSelf ? "Leave this organization?" : "Remove this member?")) return;
            startTransition(async () => notify(await removeMemberAction(orgSlug, membershipId)));
          }}
        >
          {isSelf ? "Leave organization" : "Remove member"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RevokeInviteButton({ orgSlug, invitationId }: { orgSlug: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => notify(await revokeInvitationAction(orgSlug, invitationId)))}
    >
      Revoke
    </Button>
  );
}
