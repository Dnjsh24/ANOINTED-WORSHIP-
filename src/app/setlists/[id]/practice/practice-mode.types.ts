import type { Song } from "@/lib/types";

export type PracticeSetlistSong = {
  slotId: string;
  assignedKey: string | null;
  lead: string | null;
  arrangement: string | null;
  notes: string | null;
  bandNotes: string | null;
  song: Song;
};

export type PracticeSetlist = {
  id: string;
  name: string;
  date: string;
  eventId?: string | null;
  songs: PracticeSetlistSong[];
};
