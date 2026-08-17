import {
  LEADERSHIP_ROLES,
  getLeadershipRole,
  isLeadershipRole,
  type LeadershipRoleDefinition,
} from "@/lib/domain/leadership-roles";

const BAND_LEADER = "band leader";
const BAND_MEMBER = "band member";

function normalizeMinistry(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Returns general ministry tags for display, filtering out leadership roles
 * so that leadership roles are rendered in their own dedicated Leadership Badge.
 */
export function getDisplayedMinistries(ministries: string[], role?: string | null): string[] {
  const filtered = ministries.filter((ministry) => {
    const norm = normalizeMinistry(ministry);
    // Filter out leadership roles from general ministry badges
    if (isLeadershipRole(ministry) || norm === "pastor" || norm === "worship leader" || norm === "worship team chairman") {
      return false;
    }
    return true;
  });

  const isBandLeader = role === "band_leader" || ministries.some((m) => normalizeMinistry(m) === BAND_LEADER);

  if (!isBandLeader) {
    return filtered;
  }

  return filtered.filter((ministry) => normalizeMinistry(ministry) !== BAND_MEMBER);
}

/**
 * Extracts the primary leadership role definition for a member based on their
 * system role and assigned ministries.
 */
export function getMemberLeadershipRole(
  role?: string | null,
  ministries?: string[] | null,
): LeadershipRoleDefinition | null {
  // Check direct system role first
  if (role) {
    const directRole = getLeadershipRole(role);
    if (directRole) return directRole;
  }

  // Check ministries array for leadership tags
  if (ministries && Array.isArray(ministries)) {
    for (const ministry of ministries) {
      const found = getLeadershipRole(ministry);
      if (found) return found;
    }
  }

  return null;
}
