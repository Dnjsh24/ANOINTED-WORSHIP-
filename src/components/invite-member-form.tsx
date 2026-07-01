"use client";

import { useActionState } from "react";
import { inviteMemberAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { teamRoles } from "@/lib/types";

export function InviteMemberForm() {
  const [state, formAction] = useActionState(inviteMemberAction, initialActionState);

  return (
    <form action={formAction} className="space-y-5">
      <ActionMessage state={state} />
      <label className="block space-y-2">
        <span className="text-sm font-bold text-zinc-300">Email</span>
        <Input type="email" name="email" placeholder="teammate@example.com" required />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-bold text-zinc-300">Role</span>
        <select name="role" defaultValue="member" className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-bold text-white">
          {teamRoles.map((role) => (
            <option key={role} value={role}>
              {role.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-bold text-zinc-300">Optional message</span>
        <textarea
          name="message"
          className="min-h-28 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Send Invite</SubmitButton>
        <ButtonLink href="/members" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
