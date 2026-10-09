import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { editablePermissions, resolvePermissionOverrides } from "@/lib/domain/permission-overrides";

export async function loadTeamPermissionOverrides(supabase: SupabaseClient<Database>, teamId: string, role: string, memberId: string) {
  if (role === "owner") return {};
  const { data, error } = await supabase.from("team_permission_overrides")
    .select("role, member_id, permission, allowed").eq("team_id", teamId);
  if (!error) return resolvePermissionOverrides(data ?? [], role, memberId);
  // Existing installations keep their defaults until the additive migration is deployed.
  if (error.code === "42P01" || error.code === "PGRST205") return {};
  // A failed permission read must never turn a previously denied capability back on.
  return Object.fromEntries(editablePermissions.map(permission => [permission, false]));
}
