import { z } from 'zod';
import { mobileIdentitySchema, mobileValueSchemas, type MobileIdentity } from '../contracts';
import { sharedEditRequestInputSchema, sharedEditRequestRowSchema } from '../../domain/shared-edit-requests';

export const MOBILE_DANCE_PROPOSAL_MAX_BYTES = 32768;
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const scope = { userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid() };
export const mobileDanceProposalSnapshotSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  chart: z.object({ id: z.uuid(), teamId: z.uuid(), syncRevision: revision, sharedEditRevision: revision, value: mobileValueSchemas.dance }).strict(),
  fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(row => row.chart.teamId === row.identity.teamId, 'Dance snapshot team mismatch.');
const proposal = sharedEditRequestInputSchema.refine(row => row.targetType === 'choreography', 'A Dance proposal is required.').transform(row => {
  if (row.targetType !== 'choreography') throw new Error('A Dance proposal is required.');
  return row;
});
export const mobileDanceProposalIntentSchema = z.object({ version: z.literal(2), ...scope, proposal }).strict();
export const mobileDanceProposalRequestSchema = z.object({ version: z.literal(2), intent: mobileDanceProposalIntentSchema }).strict();
export const mobileDanceProposalReceiptSchema = z.object({ version: z.literal(2), ...scope,
  request: sharedEditRequestRowSchema.strict().refine(row => row.target_type === 'choreography', 'A Dance request receipt is required.'),
}).strict();
export type MobileDanceProposalSnapshot = z.infer<typeof mobileDanceProposalSnapshotSchema>;
export type MobileDanceProposalIntent = z.infer<typeof mobileDanceProposalIntentSchema>;
export type MobileDanceProposalRequest = z.infer<typeof mobileDanceProposalRequestSchema>;
export type MobileDanceProposalReceipt = z.infer<typeof mobileDanceProposalReceiptSchema>;

export function assertDanceProposalScope(identity: Pick<MobileIdentity, 'userId' | 'teamId' | 'memberId'>, value: Pick<MobileIdentity, 'userId' | 'teamId' | 'memberId'>) {
  if (identity.userId !== value.userId || identity.teamId !== value.teamId || identity.memberId !== value.memberId) throw new Error('Dance proposal belongs to another account, team or membership.');
}
export function assertDanceProposalReceipt(intent: MobileDanceProposalIntent, receipt: MobileDanceProposalReceipt) {
  assertDanceProposalScope(intent, receipt);
  const request = receipt.request; const proposed = intent.proposal;
  if (request.team_id !== intent.teamId || request.requested_by !== intent.userId || request.target_id !== proposed.targetId
    || request.target_type !== 'choreography' || request.request_nonce !== proposed.requestNonce || request.base_revision !== proposed.revision
    || request.reason !== proposed.reason || !sameJson(request.changes, proposed.changes)) throw new Error('Matching Dance proposal receipt required. Saved intent is retained.');
}
export function assertMobileDanceProposalSnapshot(identity: MobileIdentity, chartId: string, value: unknown): MobileDanceProposalSnapshot {
  const snapshot = mobileDanceProposalSnapshotSchema.parse(value); assertDanceProposalScope(identity, snapshot.identity);
  if (snapshot.chart.id !== chartId) throw new Error('Matching Dance chart snapshot required.');
  return snapshot;
}
export function assertMobileDanceProposalReceipt(identity: MobileIdentity, chartId: string, request: MobileDanceProposalRequest, value: unknown): MobileDanceProposalReceipt {
  const intent = mobileDanceProposalRequestSchema.parse(request).intent; const receipt = mobileDanceProposalReceiptSchema.parse(value);
  assertDanceProposalScope(identity, intent);
  if (intent.proposal.targetId !== chartId) throw new Error('Matching Dance chart intent required.');
  assertDanceProposalReceipt(intent, receipt); return receipt;
}
export function sameJson(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = Object.entries(left); const b = Object.entries(right);
    return a.length === b.length && a.every(([key, value]) => key in right && sameJson(value, (right as Record<string, unknown>)[key]));
  }
  return left === right;
}
