import { type TeamRole, teamRoles } from "@/lib/types";

export type Permission =
  | "team.manage"
  | "members.manage"
  | "join_requests.review"
  | "announcements.create"
  | "events.manage"
  | "events.review"
  | "events.request"
  | "songs.create"
  | "songs.edit"
  | "songs.review"
  | "songs.delete"
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
    "events.request",
    "songs.create",
    "songs.edit",
    "songs.review",
    "songs.delete",
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
    "events.request",
    "songs.create",
    "songs.edit",
    "songs.review",
    "songs.delete",
    "setlists.manage",
    "dance_notes.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  pastor: ["announcements.create", "events.manage", "events.request", "attendance.confirm", "messages.send", "prayer_requests.create"],
  worship_leader: [
    "announcements.create",
    "events.manage",
    "events.request",
    "songs.create",
    "songs.edit",
    "songs.review",
    "songs.delete",
    "setlists.manage",
    "files.upload",
    "attendance.confirm",
    "messages.send",
    "prayer_requests.create",
  ],
  band_leader: [
    "events.request",
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

export const PERMISSION_LABELS: Record<Permission, string> = {
  "team.manage": "Manage Team Settings",
  "members.manage": "Manage Members",
  "join_requests.review": "Review Join Requests",
  "announcements.create": "Create Announcements",
  "events.manage": "Manage Events",
  "events.review": "Review Event Requests",
  "events.request": "Request Events",
  "songs.create": "Add Songs",
  "songs.edit": "Edit Songs",
  "songs.review": "Review Song Submissions",
  "songs.delete": "Delete Songs",
  "setlists.manage": "Manage Setlists",
  "dance_notes.manage": "Manage Dance Notes",
  "files.upload": "Upload Files",
  "attendance.confirm": "Confirm Attendance",
  "messages.send": "Send Messages",
  "prayer_requests.create": "Create Prayer Requests",
};

export function can(role: TeamRole | string, permission: Permission, customPermissions?: Permission[]): boolean {
  if (role === "owner") return true;
  if (customPermissions && customPermissions.includes(permission)) return true;
  
  // Cast to TeamRole if it's one of the standard roles
  if (teamRoles.includes(role as TeamRole)) {
    return permissionsByRole[role as TeamRole]?.includes(permission) ?? false;
  }
  
  return false;
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
  const base = [
    "home",
    "setlists",
    "events",
    "messages",
    "profile",
  ];

  if (can(role, "members.manage")) {
    return [...base.slice(0, -1), "members", "analytics", ...base.slice(-1)];
  }

  return base;
}
