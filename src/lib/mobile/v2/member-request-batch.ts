import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { assertMemberRequestDecisionScope, assertMobileMemberRequestDecisionReceipt, mobileMemberRequestDecisionRequestSchema, mobileMemberRequestDecisionReceiptSchema } from './member-request-decision';

export const MOBILE_MEMBER_REQUEST_BATCH_MAX_BYTES = 262144;
export const mobileMemberRequestBatchRequestSchema = z.object({
  version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  decisions: z.array(mobileMemberRequestDecisionRequestSchema).min(1).max(100),
}).strict().superRefine((request, context) => {
  const nonces = new Set([request.requestNonce.toLowerCase()]); let previous = '';
  request.decisions.forEach((child, index) => {
    if (child.userId !== request.userId || child.teamId !== request.teamId || child.memberId !== request.memberId || child.decision !== 'approved'
      || child.requestId !== child.requestId.toLowerCase() || child.requestNonce !== child.requestNonce.toLowerCase()
      || child.requestId <= previous || nonces.has(child.requestNonce)) context.addIssue({ code: 'custom', path: ['decisions', index], message: 'Use sorted unique targets, distinct nonces, approvals and the same actor scope.' });
    previous = child.requestId; nonces.add(child.requestNonce);
  });
});
export type MobileMemberRequestBatchRequest = z.infer<typeof mobileMemberRequestBatchRequestSchema>;
export const mobileMemberRequestBatchReceiptSchema = z.object({ version: z.literal(2), request: mobileMemberRequestBatchRequestSchema,
  receipts: z.array(mobileMemberRequestDecisionReceiptSchema).min(1).max(100), recordedAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobileMemberRequestBatchReceipt = z.infer<typeof mobileMemberRequestBatchReceiptSchema>;
export function assertMemberRequestBatchScope(identity: MobileIdentity, request: Pick<MobileMemberRequestBatchRequest, 'userId' | 'teamId' | 'memberId' | 'decisions'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || request.decisions.length < 1) throw new Error('Current matching batch review authority is required.');
  for (const child of request.decisions) {
    if (child.userId !== request.userId || child.teamId !== request.teamId || child.memberId !== request.memberId || child.decision !== 'approved') throw new Error('Every approval must use the same current actor scope.');
    assertMemberRequestDecisionScope(identity, child);
  }
}
export function assertMobileMemberRequestBatchReceipt(identity: MobileIdentity, request: MobileMemberRequestBatchRequest, value: unknown): MobileMemberRequestBatchReceipt {
  request = mobileMemberRequestBatchRequestSchema.parse(request);
  const result = mobileMemberRequestBatchReceiptSchema.parse(value); assertMemberRequestBatchScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request) || result.receipts.length !== request.decisions.length) throw new Error('The receipt belongs to another immutable approval batch.');
  request.decisions.forEach((child, index) => {
    const receipt = assertMobileMemberRequestDecisionReceipt(identity, child, result.receipts[index]);
    if (Date.parse(receipt.recordedAt) > Date.parse(result.recordedAt)) throw new Error('A child decision cannot follow its batch receipt.');
  });
  return result;
}
