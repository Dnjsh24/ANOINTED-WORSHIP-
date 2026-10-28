import { z } from 'zod';
import { mobileIdentitySchema, mobileValueSchemas, type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { sharedEditRequestInputSchema, sharedEditRequestRowSchema } from '../../domain/shared-edit-requests';
import { sameJson } from './dance-proposals';
export const MOBILE_SONG_PROPOSAL_MAX_BYTES = 131072;
const scope = { userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid() };
const proposal = sharedEditRequestInputSchema.refine(value => value.targetType === 'song', 'A song proposal is required.').transform(value => { if (value.targetType !== 'song') throw new Error('A song proposal is required.'); return value; });
export const mobileSongProposalIntentSchema = z.object({ version: z.literal(2), ...scope, proposal }).strict();
export const mobileSongProposalRequestSchema = z.object({ version: z.literal(2), intent: mobileSongProposalIntentSchema }).strict();
export const mobileSongProposalReceiptSchema = z.object({ version: z.literal(2), ...scope, request: sharedEditRequestRowSchema.strict().refine(row => row.target_type === 'song' && mobileValueSchemas.song.safeParse(row.before_snapshot).success && (row.after_snapshot === null || mobileValueSchemas.song.safeParse(row.after_snapshot).success), 'A complete song request receipt is required.') }).strict();
export type MobileSongProposalIntent = z.infer<typeof mobileSongProposalIntentSchema>;
export type MobileSongProposalRequest = z.infer<typeof mobileSongProposalRequestSchema>;
export type MobileSongProposalReceipt = z.infer<typeof mobileSongProposalReceiptSchema>;
export const mobileSongProposalStatusSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, songId: z.uuid(), requestNonce: z.uuid(), receipt: mobileSongProposalReceiptSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export type MobileSongProposalStatus = z.infer<typeof mobileSongProposalStatusSchema>;
export function assertSongProposalScope(identity: Pick<MobileIdentity, 'userId' | 'teamId' | 'memberId'>, value: Pick<MobileIdentity, 'userId' | 'teamId' | 'memberId'>) {
 if (identity.userId !== value.userId || identity.teamId !== value.teamId || identity.memberId !== value.memberId) throw new Error('Song proposal belongs to another account, team or membership.');
}
export function assertSongProposalReceipt(intent: MobileSongProposalIntent, receipt: MobileSongProposalReceipt) {
 assertSongProposalScope(intent, receipt); const row = receipt.request, proposed = intent.proposal;
 if (row.team_id !== intent.teamId || row.requested_by !== intent.userId || row.target_id !== proposed.targetId || row.target_type !== 'song' || row.request_nonce !== proposed.requestNonce || row.base_revision !== proposed.revision || row.reason !== proposed.reason || !sameJson(row.changes, proposed.changes)) throw new Error('Matching immutable song proposal intent required.');
}
export function assertMobileSongProposalReceipt(identity: MobileIdentity, songId: string, input: MobileSongProposalRequest, value: unknown): MobileSongProposalReceipt {
 const intent = mobileSongProposalRequestSchema.parse(input).intent, result = mobileSongProposalReceiptSchema.parse(value); assertSongProposalScope(identity, intent);
 if (intent.proposal.targetId !== songId) throw new Error('Matching song proposal target required.'); assertSongProposalReceipt(intent, result); return result;
}
export function assertMobileSongProposalStatus(identity: MobileIdentity, songId: string, input: MobileSongProposalRequest, value: unknown): MobileSongProposalStatus {
 const intent = mobileSongProposalRequestSchema.parse(input).intent, result = mobileSongProposalStatusSchema.parse(value);
 assertSongProposalScope(identity, intent); assertTeamNoticesIdentity(identity, result.identity);
 if (intent.proposal.targetId !== songId || result.songId !== songId || result.requestNonce !== intent.proposal.requestNonce) throw new Error('Matching saved song proposal status required.');
 if (result.receipt) assertMobileSongProposalReceipt(identity, songId, input, result.receipt); return result;
}
