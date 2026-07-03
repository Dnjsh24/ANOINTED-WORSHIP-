import { type TeamRole, teamRoles } from "@/lib/types";

export type Permission =
  | "team.manage"
  | "members.manage"
  | "join_requests.review"
  | "announcements.create"
  | "events.manage"
  | "events.review"
  | "songs.create"
  | "songs.edit"
  | "songs.review"
  | "setlists.manage"
  | "dance_notes.manage"
  | "files.upload"
  | "attendance.confirm"
  | "messages.send"
  | "prayer_requests.create";

const permissionsByRole: Record<TeamRole, Permission[]> = {
  owner: [
    "team.manage",
    "members.manage",
    "join_requests.review",
    "announcements.create",
    "events.manage",
    "events.review",
    "songs.create",
    "songs.edit",
    "songs.review",
    "setlists.manage",
    "dance_notes.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  admin: [
    "members.manage",
    "join_requests.review",
    "announcements.create",
    "events.manage",
    "events.review",
    "songs.review",
    "setlists.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  pastor: ["announcements.create", "events.manage", "attendance.confirm", "messages.send", "prayer_requests.create"],
  worship_leader: [
    "announcements.create",
    "events.manage",
    "songs.create",
    "songs.edit",
    "songs.review",
    "setlists.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  band_leader: [
    "songs.create",
    "songs.edit",
    "songs.review",
    "setlists.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  band_member: ["songs.create", "songs.edit", "files.upload", "attendance.confirm", "messages.send", "prayer_requests.create"],
  dancer: ["dance_notes.manage", "files.upload", "attendance.confirm", "messages.send", "prayer_requests.create"],
  media: ["files.upload", "attendance.confirm", "messages.send", "prayer_requests.create"],
  member: ["attendance.confirm", "messages.send", "prayer_requests.create"],
};

export function can(role: TeamRole, permission: Permission) {
  return permissionsByRole[role].includes(permission);
}

export function assertRole(value: string): TeamRole {
  if (!teamRoles.includes(value as TeamRole)) {
    throw new Error(`Unsupported team role: ${value}`);
  }

  return value as TeamRole;
}

export function canReviewJoinRequests(role: TeamRole) {
  return can(role, "join_requests.review");
}

export function canManageSetlists(role: TeamRole) {
  return can(role, "setlists.manage");
}

export function canReviewEventRequests(role: TeamRole) {
  return can(role, "events.review");
}

export function visibleNavigation(role: TeamRole) {
  const base = ["home", "setlists", "events", "messages", "profile"];

  if (can(role, "members.manage")) {
    return [...base.slice(0, 4), "members", ...base.slice(4)];
  }

  return base;
}
