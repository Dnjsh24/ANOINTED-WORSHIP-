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

export type JoinRequestStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "available" | "maybe" | "unavailable" | "pending";
export type EventType = "service" | "rehearsal" | "meeting" | "special_event";

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

export interface SongSection {
  label: string;
  lines: Array<{
    chords?: string;
    lyric: string;
  }>;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  currentKey: string;
  bpm: number;
  timeSignature: string;
  tags: string[];
  favorite: boolean;
  sections: SongSection[];
  youtubeUrl?: string;
}

export interface SetlistSong {
  id: string;
  song: Song;
  order: number;
  assignedKey: string;
  lead?: string;
  band?: string[];
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
}

export interface Event {
  id: string;
  name: string;
  type: EventType;
  date: string;
  time: string;
  location: string;
  assignedTeams: string[];
  confirmed: number;
  pending: number;
  setlistId?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  createdBy: string;
  createdAt: string;
}

export interface Message {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  mine?: boolean;
  avatarUrl?: string | null;
  attachment?: {
    name: string;
    size: string;
  };
}
