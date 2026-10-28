import { z } from 'zod';
import { mobileIdentitySchema, mobileValueSchemas, type MobileIdentity, type MobileLiveRecord } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { canEditSongDirectly } from '../../domain/shared-edit-requests';
import { sameJson } from './dance-proposals';
const time = z.iso.datetime({ offset: true }).refine(value => (value.match(/\.(\d+)/)?.[1].length ?? 0) <= 6);
export const mobileSongEditorContextSchema = z.object({
 version: z.literal(2), identity: mobileIdentitySchema,
 song: z.object({ id: z.uuid(), teamId: z.uuid(), createdAt: time, createdBy: z.uuid(), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), value: mobileValueSchemas.song }).strict(),
 authorization: z.object({ direct: z.boolean(), propose: z.boolean(), editOverride: z.boolean().nullable() }).strict(), fetchedAt: time,
}).strict().refine(value => {
 const direct = canEditSongDirectly(value.identity.role, value.identity.userId, value.song.createdBy, value.authorization.editOverride === null ? {} : { 'songs.edit': value.authorization.editOverride });
 return value.song.teamId === value.identity.teamId && value.authorization.direct === direct && value.authorization.propose === !direct && (value.identity.role !== 'owner' || value.authorization.editOverride === null);
}, 'Song editor mode must match actual creator and explicit override.');
export type MobileSongEditorContext = z.infer<typeof mobileSongEditorContextSchema>;
export function assertMobileSongEditorContext(identity: MobileIdentity, songId: string, value: unknown): MobileSongEditorContext {
 const result = mobileSongEditorContextSchema.parse(value); assertTeamNoticesIdentity(identity, result.identity);
 if (result.song.id !== songId || result.song.teamId !== identity.teamId) throw new Error('Song editor belongs to another account, workspace or song.');
 return result;
}
/** This only validates the cached editor against an already downloaded base. It creates no server record base or new authority. */
export function assertMobileSongEditorBase(identity: MobileIdentity, record: Extract<MobileLiveRecord, { entityType: 'song' }>, value: unknown): MobileSongEditorContext {
 const result = assertMobileSongEditorContext(identity, record.id, value);
 if (record.revision !== result.song.revision || record.deleted || !sameJson(record.value, result.song.value)) throw new Error('Refresh this song editor against its original confirmed downloaded base.');
 return result;
}
