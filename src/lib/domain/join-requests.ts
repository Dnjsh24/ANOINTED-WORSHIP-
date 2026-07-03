import type { JoinRequestSummary, TeamRole } from "@/lib/types";

type RawJoinRequestProfile = {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export type RawJoinRequest = {
  id: string;
  profile_id?: string | null;
  requested_role?: TeamRole | null;
  created_at?: string | null;
  profiles?: RawJoinRequestProfile | RawJoinRequestProfile[] | null;
};

export function formatRoleLabel(role: string | null | undefined) {
  return (role ?? "member")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "JR";
}

export function normalizeJoinRequest(request: RawJoinRequest): JoinRequestSummary {
  const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
  const name = profile?.full_name ?? profile?.email ?? "Unknown";
  const requestedRole = request.requested_role ?? "member";

  return {
    id: request.id,
    initials: getInitials(name),
    name,
    email: profile?.email ?? undefined,
    avatarUrl: profile?.avatar_url ?? undefined,
    ministry: formatRoleLabel(requestedRole),
    requestedRole,
    requestedAt: request.created_at ?? undefined,
  };
}
