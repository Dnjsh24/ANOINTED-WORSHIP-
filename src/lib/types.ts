export const teamRoles = [
  "owner",
  "admin",
  "pastor",
  "worship_leader",
  "band_leader",
  "band_member",
  "dancer",
  "media",
  "member",
] as const;

export type TeamRole = (typeof teamRoles)[number];

export type JoinRequestStatus = "pending" | "approved" | "rejected" | "canceled";
export type AttendanceStatus = "available" | "maybe" | "unavailable" | "pending";
export type EventType = "service" | "rehearsal" | "meeting" | "special_event" | "service_rehearsal";
export type EventApprovalStatus = "pending" | "approved" | "rejected";
export type NoticePriority = "normal" | "important" | "urgent";
export type ReminderRecurrence = "none" | "weekly" | "monthly";
export type SetlistChangeType = "created" | "updated" | "song_added" | "song_removed" | "song_reordered";

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
}

export interface TeamMember {
  id: string;
  profile: Profile;
  role: TeamRole;
  status: "active" | "inactive";
  attendanceRate: number;
  ministry: string;
}

export interface NoticeMemberTarget {
  memberId: string;
  profileId: string;
  name: string;
  email: string;
  role: TeamRole;
  avatarUrl?: string;
}

export interface NoticeEventTarget {
  id: string;
  name: string;
  date: string;
}

export interface JoinRequestSummary {
  id: string;
  initials: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  ministry: string;
  requestedRole: TeamRole;
  requestedAt?: string;
}

export interface ChordToken {
  chord: string; // chord name (empty string for plain lyric segments)
  lyric: string; // lyric text that follows this chord
}

export interface SongSection {
  label: string;
  lines: Array<{
    chords?: string;
    lyric: string;
    tokens?: ChordToken[]; // ChordPro inline format
  }>;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  currentKey: string;
  bpm: number | null;
  timeSignature: string;
  tags: string[];
  favorite: boolean;
  sections: SongSection[];
  youtubeUrl?: string;
  spotifyUrl?: string;
  imageUrl?: string;
  album?: string;
}

export interface SetlistSong {
  id: string;
  song: Song;
  order: number;
  assignedKey: string;
  lead?: string;
  band?: string[];
  arrangement?: string | null;
}

export interface Setlist {
  id: string;
  name: string;
  date: string;
  leader: string;
  location: string;
  callTime: string;
  rehearsalTime: string;
  serviceTimes: string[];
  songs: SetlistSong[];
  notes?: string;
  eventId?: string;
  eventType?: EventType;
}

export interface ServiceTemplateRoles {
  worshipLeader?: string;
  acousticGuitar?: string;
  electricGuitar?: string;
  bass?: string;
  drums?: string;
  mainKeys?: string;
  secondKeys?: string;
  extraBandMembers?: string[];
  backupSingers?: string[];
  media?: string;
  dancers?: string[];
}

export interface ServiceTemplate {
  id: string;
  name: string;
  serviceType: string;
  location: string;
  callTime: string;
  rehearsalTime: string;
  reminderFrequency: ReminderRecurrence;
  reminderOccurrences: number;
  defaultRoles: ServiceTemplateRoles;
}

export interface SetlistChangeLog {
  id: string;
  changeType: SetlistChangeType;
  summary: string;
  changedBy?: string;
  createdAt: string;
}

export interface Event {
  id: string;
  name: string;
  type: EventType;
  date: string;
  time: string;
  rehearsalDate?: string | null;
  rehearsalStart?: string | null;
  location: string;
  assignedTeams: string[];
  confirmed: number;
  pending: number;
  approvalStatus?: EventApprovalStatus;
  createdByMe?: boolean;
  setlistId?: string;
  myStatus?: "available" | "maybe" | "unavailable" | "pending" | "no_response";
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  createdBy: string;
  createdAt: string;
  targetLabel?: string;
  priority?: NoticePriority;
  eventId?: string;
}

export interface Message {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  mine?: boolean;
  avatarUrl?: string | null;
  attachment?: {
    id?: string;
    name: string;
    size: string;
    type?: string;
    mimeType?: string;
    url?: string;
  };
}
