import { z } from 'zod';
import type { MobileIdentity } from '../contracts';

export const TEAM_NOTICE_ACK_MAX_BYTES = 1024;
const acknowledgement = { version: z.literal(2), kind: z.enum(['announcement', 'reminder']), targetId: z.uuid(), requestNonce: z.uuid(), acknowledged: z.literal(true) };
export const teamNoticeAckRequestSchema = z.object(acknowledgement).strict();
export const teamNoticeAckReceiptSchema = z.object({ ...acknowledgement, userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), acknowledgedAt: z.iso.datetime({ offset: true }) }).strict();
export type TeamNoticeAckRequest = z.infer<typeof teamNoticeAckRequestSchema>;
export type TeamNoticeAckReceipt = z.infer<typeof teamNoticeAckReceiptSchema>;
export function assertTeamNoticeAckReceipt(identity: MobileIdentity, request: TeamNoticeAckRequest, value: unknown): TeamNoticeAckReceipt {
  const receipt = teamNoticeAckReceiptSchema.parse(value); request = teamNoticeAckRequestSchema.parse(request);
  if (receipt.userId !== identity.userId || receipt.teamId !== identity.teamId || receipt.memberId !== identity.memberId
    || receipt.kind !== request.kind || receipt.targetId !== request.targetId || receipt.requestNonce !== request.requestNonce) throw new Error('A matching persisted notice acknowledgement is required.');
  return receipt;
}
