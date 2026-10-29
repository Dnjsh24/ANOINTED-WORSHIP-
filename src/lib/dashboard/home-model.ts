export type DashboardIconKey =
  | "activity" | "alertCircle" | "alertTriangle" | "barChart" | "calendar" | "checkCircle"
  | "clock" | "folder" | "footprints" | "gift" | "info" | "mapPin" | "message" | "music"
  | "settings" | "sparkles" | "user" | "users" | "monitorPlay" | "refresh" | "smartphone";

export type DashboardAnnouncement = {
  iconKey: DashboardIconKey;
  color: string;
  bg: string;
  badge: string;
  badgeColor: string;
  title: string;
  body: string;
};

export type DashboardReminder = {
  iconKey: DashboardIconKey;
  title: string;
  body: string;
  due: string;
  dueColor: string;
  href: string;
};

export type DashboardContentModel = {
  teamName: string | null;
  firstName: string;
  nextEvent: { id: string; name: string } | null;
  nextSetlist: {
    id: string; name: string; date: string; location: string | null; callTime: string | null;
    rehearsalTime: string | null; leader: string | null; eventType: string | null; serviceTimes: string[];
  } | null;
  nextSetlistTypeLabel: string;
  nextDateLabel: string;
  setlistSongs: { id: string; assignedKey: string; song: { id: string; title: string; bpm: number | null } }[];
  isAdminOrOwner: boolean;
  upcomingEventsCount: number | null;
  pendingRequestsCount: number | null;
  confirmedThisMonthCount: number | null;
  myConfirmedCount: number | null;
  totalSetlistsCount: number | null;
  announcementItems: DashboardAnnouncement[];
  reminders: DashboardReminder[];
  activityLogs: {
    id: string; action: string; targetType: string; createdAt: string;
    profile: { fullName: string } | null; details: { name?: string; title?: string };
  }[];
  upcomingCelebrations: { name: string; type: "Birthday" | "Team Anniversary"; date: string; daysAway: number }[];
  quickLinks: { href: string; label: string; sub: string; iconKey: DashboardIconKey }[];
};

