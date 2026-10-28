import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { compareSupportReadMarkerTimes } from './support-read-marker';
import { mobileSongRestoreBaseSchema, mobileSongRestoreRequestSchema, mobileSongRestoreSnapshotSchema, mobileSongTrashEntrySchema } from './song-trash';
export const MOBILE_SONG_PURGE_MAX_BYTES = 8192;
export const MOBILE_SONG_PURGE_IMPACT_LIMIT = 2000;
const time = z.iso.datetime({ offset: true }).refine(value => (value.match(/\.(\d+)/)?.[1].length ?? 0) <= 6);
const count = z.number().int().min(0).max(MOBILE_SONG_PURGE_IMPACT_LIMIT);
export const mobileSongPurgeImpactSchema = z.object({ counts: z.object({ songs: z.literal(1), setlists: count, setlistSlots: count, favorites: count, versions: count, editRequests: count, danceNotes: count, annotations: count, readinessResponses: count, detachedPracticeFiles: count, detachedLegacyRequests: count }).strict(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type MobileSongPurgeImpact = z.infer<typeof mobileSongPurgeImpactSchema>;
export const mobileSongPurgeRequestSchema = mobileSongRestoreRequestSchema.safeExtend({ impact: mobileSongPurgeImpactSchema });
export type MobileSongPurgeRequest = z.infer<typeof mobileSongPurgeRequestSchema>;
export const mobileSongPurgeStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, memberCreatedAt: time, fetchedAt: time, songId: z.uuid(), status: z.enum(['ready', 'missing', 'not-trashed', 'impact-too-large', 'related-records-blocked']), current: mobileSongTrashEntrySchema.nullable(), impact: mobileSongPurgeImpactSchema.nullable() }).strict().refine(value => value.status === 'missing' ? value.current === null && value.impact === null : value.current !== null && (value.status === 'not-trashed' ? value.current.snapshot.deletedAt === null && value.impact === null : value.current.snapshot.deletedAt !== null && (value.status === 'ready' ? value.impact !== null : value.impact === null)), 'Purge review must describe a complete current Trash impact.');
export type MobileSongPurgeState = z.infer<typeof mobileSongPurgeStateSchema>;
export const mobileSongPurgeReceiptSchema = z.object({ version: z.literal(2), request: mobileSongPurgeRequestSchema, status: z.enum(['applied', 'conflict', 'missing', 'related-records-blocked']), current: mobileSongRestoreSnapshotSchema.nullable(), recordedAt: time }).strict().refine(value => {
 if (value.status === 'applied' || value.status === 'missing') return value.current === null;
 const current = value.current, base = value.request.base;
 if (current === null || current.id !== base.id || current.teamId !== base.teamId) return false;
 return value.status === 'conflict' || current.revision === base.revision && compareSupportReadMarkerTimes(current.createdAt, base.createdAt) === 0 && current.deletedAt !== null && compareSupportReadMarkerTimes(current.deletedAt, base.deletedAt) === 0;
}, 'Purge receipt must describe the original song scope.');
export type MobileSongPurgeReceipt = z.infer<typeof mobileSongPurgeReceiptSchema>;
export function assertSongPurgeScope(identity: MobileIdentity, request: Pick<MobileSongPurgeRequest, 'userId' | 'teamId' | 'memberId'> = identity) { if (identity.userId !== request.userId || identity.teamId !== request.teamId || identity.memberId !== request.memberId || !['owner', 'admin'].includes(identity.role) || !identity.permissions.includes('songs.delete')) throw new Error('Current matching owner/admin song deletion authority is required.'); }
export function assertMobileSongPurgeState(identity: MobileIdentity, songId: string, value: unknown): MobileSongPurgeState { const result = mobileSongPurgeStateSchema.parse(value); assertTeamNoticesIdentity(identity, result.identity); assertSongPurgeScope(identity); if (result.songId !== songId || result.current && (result.current.snapshot.id !== songId || result.current.snapshot.teamId !== identity.teamId)) throw new Error('Song purge review scope differs.'); return result; }
export function assertMobileSongPurgeReceipt(identity: MobileIdentity, request: MobileSongPurgeRequest, value: unknown): MobileSongPurgeReceipt { request = mobileSongPurgeRequestSchema.parse(request); assertSongPurgeScope(identity, request); const result = mobileSongPurgeReceiptSchema.parse(value); if (JSON.stringify(result.request) !== JSON.stringify(request)) throw new Error('Purge receipt belongs to another immutable intent.'); return result; }
export { mobileSongRestoreBaseSchema as mobileSongPurgeBaseSchema };


