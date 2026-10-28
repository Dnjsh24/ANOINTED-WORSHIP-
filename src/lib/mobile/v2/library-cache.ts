import { z } from 'zod';
import type { MobileSetlistReadModel, MobileSongReadModel } from './library-read-models';

const song = z.object({
  id: z.uuid(), title: z.string(), artist: z.string(), originalKey: z.string(), currentKey: z.string(),
  bpm: z.number().finite().nullable(), timeSignature: z.string(), tags: z.array(z.string()), favorite: z.boolean(),
  sections: z.array(z.object({ label: z.string(), lines: z.array(z.object({
    lyric: z.string(), chords: z.string().optional(), tokens: z.array(z.object({ chord: z.string(), lyric: z.string() }).strict()).optional(),
  }).strict()) }).strict()),
  rawLyricsChords: z.string().optional(), youtubeUrl: z.string().optional(), spotifyUrl: z.string().optional(),
  imageUrl: z.string().optional(), album: z.string().optional(), playCount: z.number().int().nonnegative().optional(),
});
export const mobileSongReadModelSchema: z.ZodType<MobileSongReadModel> = song.extend({ lyricsChords: z.string() }).strict();
export const mobileSetlistReadModelSchema: z.ZodType<MobileSetlistReadModel> = z.object({
  id: z.uuid(), name: z.string(), date: z.iso.date(), leader: z.string(), location: z.string(),
  callTime: z.string(), rehearsalTime: z.string(), serviceTimes: z.array(z.string()), notes: z.string().optional(),
  eventId: z.uuid().optional(), eventType: z.enum(['service', 'rehearsal', 'meeting', 'special_event', 'service_rehearsal']).optional(),
  eventLabel: z.string(), leaderMemberId: z.uuid().nullable(), createdBy: z.uuid(), presentationSettings: z.json().nullable(),
  songs: z.array(z.object({
    id: z.uuid(), song: mobileSongReadModelSchema, order: z.number().int(), assignedKey: z.string(), lead: z.string(), band: z.array(z.string()).optional(),
    arrangement: z.string().nullable(), bandNotes: z.string().nullable(), leadMemberId: z.uuid().nullable(), youtubeUrl: z.string().nullable(),
    notes: z.string().nullable(), slideSettings: z.json().nullable(), createdAt: z.iso.datetime({ offset: true }),
  }).strict()),
  history: z.array(z.object({
    id: z.uuid(), changeType: z.enum(['created', 'updated', 'song_added', 'song_removed', 'song_reordered']), summary: z.string(),
    changedBy: z.string(), createdAt: z.iso.datetime({ offset: true }), snapshot: z.json(),
  }).strict()),
}).strict();
export const mobileLibraryCacheSchema = z.object({
  version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(),
  songs: z.array(mobileSongReadModelSchema), setlists: z.array(mobileSetlistReadModelSchema),
}).strict();
export type MobileLibraryCache = z.infer<typeof mobileLibraryCacheSchema>;
