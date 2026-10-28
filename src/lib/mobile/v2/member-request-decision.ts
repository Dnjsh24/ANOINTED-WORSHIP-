import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_MEMBER_REQUEST_DECISION_MAX_BYTES = 32768;
const time = z.iso.datetime({ offset: true });
export const memberRequestDecisionBaseSchema = z.object({ profileId: z.uuid(), requestedRole: z.enum(teamRoles), requestedAt: time, status: z.literal('pending') }).strict();
export type MemberRequestDecisionBase = z.infer<typeof memberRequestDecisionBaseSchema>;
export const mobileMemberRequestDecisionRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  requestId: z.uuid(), base: memberRequestDecisionBaseSchema, decision: z.enum(['approved', 'rejected']) }).strict();
export type MobileMemberRequestDecisionRequest = z.infer<typeof mobileMemberRequestDecisionRequestSchema>;
const current = z.object({ id: z.uuid(), teamId: z.uuid(), profileId: z.uuid(), requestedRole: z.enum(teamRoles), requestedAt: time,
  status: z.enum(['pending', 'approved', 'rejected', 'canceled']), reviewedBy: z.uuid().nullable(), reviewedAt: time.nullable() }).strict();
const membership = z.object({ id: z.uuid(), teamId: z.uuid(), profileId: z.uuid(), role: z.enum(teamRoles), status: z.enum(['active', 'inactive']) }).strict();
export const mobileMemberRequestDecisionReceiptSchema = z.object({ version: z.literal(2), request: mobileMemberRequestDecisionRequestSchema,
  status: z.enum(['applied', 'conflict', 'missing', 'blocked']), current: current.nullable(), membership: membership.nullable(),
  reason: z.enum(['existing_membership', 'privileged_request']).nullable(), recordedAt: time }).strict();
export type MobileMemberRequestDecisionReceipt = z.infer<typeof mobileMemberRequestDecisionReceiptSchema>;
type ScopedRequest = Pick<MobileMemberRequestDecisionRequest, 'userId' | 'teamId' | 'memberId' | 'decision' | 'base'>;
export function assertMemberRequestDecisionScope(identity: MobileIdentity, request: ScopedRequest) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId
    || !identity.permissions.includes('members.manage') || !identity.permissions.includes('join_requests.review')
    || request.decision === 'approved' && request.base.requestedRole !== 'member' && !['owner', 'admin'].includes(identity.role)) throw new Error('Current matching review/member-management and role-assignment authority is required.');
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && same(value, (right as Record<string, unknown>)[key]));
}
export function assertMobileMemberRequestDecisionReceipt(identity: MobileIdentity, request: MobileMemberRequestDecisionRequest, value: unknown): MobileMemberRequestDecisionReceipt {
  request = mobileMemberRequestDecisionRequestSchema.parse(request); const result = mobileMemberRequestDecisionReceiptSchema.parse(value); assertMemberRequestDecisionScope(identity, request);
  if (!same(request, result.request)) throw new Error('The receipt belongs to another immutable join-request decision.');
  const row = result.current; const member = result.membership;
  if (row && (row.id !== request.requestId || row.teamId !== request.teamId) || member && (member.teamId !== request.teamId || member.profileId !== request.base.profileId)) throw new Error('Join-request receipt target or membership scope changed.');
  const matches = row !== null && row.profileId === request.base.profileId && row.requestedRole === request.base.requestedRole && Date.parse(row.requestedAt) === Date.parse(request.base.requestedAt);
  const pendingMatches = matches && row?.status === 'pending' && row.reviewedBy === null && row.reviewedAt === null;
  if (result.status !== 'blocked' && result.reason !== null) throw new Error('Only a blocked decision may include a blocked reason.');
  if (result.status === 'missing') {
    if (row !== null || member !== null) throw new Error('Missing requests cannot claim a decision or membership.');
  } else if (result.status === 'conflict') {
    if (!row || pendingMatches || member !== null) throw new Error('Conflicts require a changed current request without membership writes.');
  } else if (result.status === 'blocked') {
    if (!pendingMatches || !result.reason
      || (result.reason === 'existing_membership' ? request.decision !== 'approved' || member === null : !['owner', 'admin'].includes(request.base.requestedRole) || member !== null)) throw new Error('Blocked decisions require a matching unchanged request and bounded reason.');
  } else {
    if (!matches || row?.status !== request.decision || row.reviewedBy !== identity.userId || row.reviewedAt === null || Date.parse(row.reviewedAt) > Date.parse(result.recordedAt)
      || ['owner', 'admin'].includes(request.base.requestedRole)) throw new Error('The exact terminal review was not confirmed.');
    if (request.decision === 'approved' ? !member || member.role !== request.base.requestedRole || member.status !== 'active' : member !== null) throw new Error('Approval membership or membership-free rejection was not confirmed.');
  }
  return result;
}
