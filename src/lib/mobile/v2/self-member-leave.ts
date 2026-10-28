import { z } from 'zod';
import { memberRoleAssignmentSnapshotSchema } from './member-role-assignment';
export const MOBILE_SELF_MEMBER_LEAVE_MAX_BYTES = 32768;
export const mobileSelfMemberLeaveScopeSchema = z.object({ userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid() }).strict();
export type MobileSelfMemberLeaveScope = z.infer<typeof mobileSelfMemberLeaveScopeSchema>;
export const mobileSelfMemberLeaveBaseSchema = z.object({ ownerId: z.uuid(), member: memberRoleAssignmentSnapshotSchema }).strict();
export type MobileSelfMemberLeaveBase = z.infer<typeof mobileSelfMemberLeaveBaseSchema>;
export const mobileSelfMemberLeaveRequestSchema = mobileSelfMemberLeaveScopeSchema.extend({ version: z.literal(2), requestNonce: z.uuid(),
  confirmation: z.literal('LEAVE TEAM'), base: mobileSelfMemberLeaveBaseSchema }).strict().refine(value => value.base.member.id === value.memberId
  && value.base.member.profileId === value.userId && value.base.member.teamId === value.teamId && value.base.member.status === 'active'
  && value.base.member.role !== 'owner' && value.base.ownerId !== value.userId, 'Confirm your own active non-owner membership.');
export type MobileSelfMemberLeaveRequest = z.infer<typeof mobileSelfMemberLeaveRequestSchema>;
export const mobileSelfMemberLeaveReceiptSchema = z.object({ version: z.literal(2), request: mobileSelfMemberLeaveRequestSchema,
  status: z.enum(['applied', 'conflict', 'blocked']), current: mobileSelfMemberLeaveBaseSchema.nullable(), reason: z.literal('related_records').nullable(),
  recordedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => {
  if (value.status === 'applied') return value.current === null && value.reason === null;
  if (!value.current || value.current.member.id !== value.request.memberId || value.current.member.teamId !== value.request.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(value.request.base);
  return value.status === 'blocked' ? same && value.reason === 'related_records' : !same && value.reason === null;
}, 'Confirm the exact deleted, changed or protected membership.');
export type MobileSelfMemberLeaveReceipt = z.infer<typeof mobileSelfMemberLeaveReceiptSchema>;
export const mobileSelfMemberLeaveQuerySchema = z.object({ requestNonce: z.uuid().optional() }).strict();
export type MobileSelfMemberLeaveQuery = z.infer<typeof mobileSelfMemberLeaveQuerySchema>;
export const mobileSelfMemberLeaveStateSchema = mobileSelfMemberLeaveScopeSchema.extend({ version: z.literal(2), requestNonce: z.uuid().nullable(),
  current: mobileSelfMemberLeaveBaseSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => value.requestNonce !== null
  ? value.current === null : value.current !== null && value.current.member.id === value.memberId && value.current.member.teamId === value.teamId
    && value.current.member.profileId === value.userId && value.current.member.status === 'active', 'Verify your active membership or sealed departure.');
export type MobileSelfMemberLeaveState = z.infer<typeof mobileSelfMemberLeaveStateSchema>;
export function assertSelfMemberLeaveScope(scope: MobileSelfMemberLeaveScope, value: MobileSelfMemberLeaveScope) {
  if (scope.userId !== value.userId || scope.teamId !== value.teamId || scope.memberId !== value.memberId) throw new Error('Reopen the original account and membership for this saved departure.');
}
export function assertMobileSelfMemberLeaveReceipt(scope: MobileSelfMemberLeaveScope, request: MobileSelfMemberLeaveRequest, value: unknown): MobileSelfMemberLeaveReceipt {
  request = mobileSelfMemberLeaveRequestSchema.parse(request); assertSelfMemberLeaveScope(scope, request);
  const receipt = mobileSelfMemberLeaveReceiptSchema.parse(value);
  if (JSON.stringify(receipt.request) !== JSON.stringify(request)) throw new Error('The receipt belongs to another immutable departure.');
  return receipt;
}
export function assertMobileSelfMemberLeaveState(scope: MobileSelfMemberLeaveScope, input: MobileSelfMemberLeaveQuery, value: unknown): MobileSelfMemberLeaveState {
  input = mobileSelfMemberLeaveQuerySchema.parse(input); const result = mobileSelfMemberLeaveStateSchema.parse(value); assertSelfMemberLeaveScope(scope, result);
  if (result.requestNonce !== (input.requestNonce ?? null)) throw new Error('The departure proof belongs to another saved request.');
  return result;
}
