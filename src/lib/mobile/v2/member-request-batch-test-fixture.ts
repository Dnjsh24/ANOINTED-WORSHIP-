import type { MobileMemberRequestBatchRequest, MobileMemberRequestBatchReceipt } from './member-request-batch';
import { memberRequestDecisionIdentity, memberRequestDecisionRequest, memberRequestDecisionReceipt } from './member-request-decision-test-fixture';
export const memberRequestBatchId = (n: number) => `99200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const memberRequestBatchIdentity = memberRequestDecisionIdentity;
export const memberRequestBatchRequest: MobileMemberRequestBatchRequest = { version: 2, userId: memberRequestBatchIdentity.userId, teamId: memberRequestBatchIdentity.teamId,
  memberId: memberRequestBatchIdentity.memberId, requestNonce: memberRequestBatchId(1), decisions: [memberRequestDecisionRequest] };
export const memberRequestBatchReceipt: MobileMemberRequestBatchReceipt = { version: 2, request: memberRequestBatchRequest, receipts: [memberRequestDecisionReceipt], recordedAt: '2026-10-22T02:00:02Z' };
