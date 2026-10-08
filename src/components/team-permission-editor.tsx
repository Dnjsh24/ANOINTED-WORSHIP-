"use client";

import { useActionState, useState } from "react";
import { setTeamPermissionOverrideAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { initialActionState } from "@/lib/action-state";
import { editablePermissions, resolvePermissionOverrides, canForTeam, type PermissionOverrideRow } from "@/lib/domain/permission-overrides";
import { PERMISSION_LABELS, type Permission } from "@/lib/domain/rbac";
import { teamRoles } from "@/lib/types";

export type PermissionMember = { id: string; name: string; role: string; customPermissions: Permission[] };

export function TeamPermissionEditor({ teamId, members, overrides, available, isOwner }: {
  teamId: string; members: PermissionMember[]; overrides: PermissionOverrideRow[]; available: boolean; isOwner: boolean;
}) {
  const [targetKind, setTargetKind] = useState("role");
  const [role, setRole] = useState("admin");
  const editableMembers = members.filter(member => member.role !== "owner");
  const [memberId, setMemberId] = useState(editableMembers[0]?.id ?? "");
  const [state, action] = useActionState(setTeamPermissionOverrideAction, initialActionState);
  const member = editableMembers.find(item => item.id === memberId);
  const targetRole = targetKind === "person" ? member?.role ?? "member" : role;
  const effectiveOverrides = resolvePermissionOverrides(overrides, targetRole, targetKind === "person" ? memberId : undefined);

  return <div className="space-y-4">
    <p className="text-xs text-zinc-400">Person overrides take priority over role overrides. Owner access remains protected.</p>
    {!available && <p role="status" className="text-sm text-amber-300">Permission editing is unavailable until the database update is applied.</p>}
    <div className="flex flex-wrap gap-4">
      <label className="space-y-1 text-sm">Edit permissions for
        <select className="block rounded-lg border border-white/10 bg-[#17161b] p-2" value={targetKind} onChange={event => setTargetKind(event.target.value)}>
          <option value="role">A role</option><option value="person">A person</option>
        </select>
      </label>
      {targetKind === "role" ? <label className="space-y-1 text-sm">Role
        <select className="block rounded-lg border border-white/10 bg-[#17161b] p-2" value={role} onChange={event => setRole(event.target.value)}>
          {teamRoles.filter(item => item !== "owner").map(item => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </label> : <label className="space-y-1 text-sm">Member
        <select className="block max-w-full rounded-lg border border-white/10 bg-[#17161b] p-2" value={memberId} onChange={event => setMemberId(event.target.value)} disabled={!editableMembers.length}>
          {!editableMembers.length && <option value="">No eligible members</option>}
          {editableMembers.map(item => <option key={item.id} value={item.id}>{item.name} ({item.role.replaceAll("_", " ")})</option>)}
        </select>
      </label>}
    </div>
    <ActionMessage state={state} />
    <div className="divide-y divide-white/10">
      {editablePermissions.map(permission => {
        const ownOverride = overrides.find(row => row.permission === permission && (targetKind === "role" ? row.role === role : row.member_id === memberId));
        const value = ownOverride ? ownOverride.allowed ? "allow" : "deny" : "inherit";
        const allowed = canForTeam({ role: targetRole, customPermissions: targetKind === "person" ? member?.customPermissions : [], permissionOverrides: effectiveOverrides }, permission);
        return <form action={action} key={`${targetKind}:${role}:${memberId}:${permission}:${value}`} className="flex flex-wrap items-center gap-3 py-3">
          <input type="hidden" name="teamId" value={teamId} /><input type="hidden" name="targetKind" value={targetKind} />
          <input type="hidden" name="role" value={role} /><input type="hidden" name="memberId" value={memberId} /><input type="hidden" name="permission" value={permission} />
          <label className="min-w-48 flex-1 text-sm font-semibold" htmlFor={`override-${permission}`}>{PERMISSION_LABELS[permission]}<span className={`ml-2 text-xs ${allowed ? "text-emerald-300" : "text-zinc-400"}`}>{allowed ? "Allowed" : "Denied"}</span></label>
          <select id={`override-${permission}`} name="value" defaultValue={value} disabled={!isOwner || !available || (targetKind === "person" && !member)} className="rounded-lg border border-white/10 bg-[#17161b] p-2 text-sm">
            <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
          </select>
          {isOwner && available && (targetKind === "role" || member) && <SubmitButton>Save</SubmitButton>}
        </form>;
      })}
    </div>
  </div>;
}
