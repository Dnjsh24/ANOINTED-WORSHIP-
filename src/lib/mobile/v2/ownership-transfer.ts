import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { memberRoleAssignmentSnapshotSchema } from './member-role-assignment';
import { assertRolePermissionOverrideScope } from './role-permission-override';
export const MOBILE_OWNERSHIP_TRANSFER_MAX_BYTES = 32768;
export const mobileOwnershipTransferCurrentSchema = z.object({ ownerId: z.uuid(), actor: memberRoleAssignmentSnapshotSchema, target: memberRoleAssignmentSnapshotSchema.nullable() }).strict()
  .refine(value => value.target === null || value.target.teamId === value.actor.teamId && value.target.id !== value.actor.id && value.target.profileId !== value.actor.profileId, 'Use distinct memberships in the same team.');
export type MobileOwnershipTransferCurrent = z.infer<typeof mobileOwnershipTransferCurrentSchema>;
export const mobileOwnershipTransferBaseSchema = z.object({ ownerId: z.uuid(), actor: memberRoleAssignmentSnapshotSchema, target: memberRoleAssignmentSnapshotSchema }).strict()
  .refine(value => value.ownerId === value.actor.profileId && value.actor.role === 'owner' && value.actor.status === 'active' && value.target.status === 'active' && value.target.role !== 'owner'
    && value.target.teamId === value.actor.teamId && value.target.id !== value.actor.id && value.target.profileId !== value.actor.profileId, 'Choose another active non-owner membership under the current owner.');
export type MobileOwnershipTransferBase = z.infer<typeof mobileOwnershipTransferBaseSchema>;
export const mobileOwnershipTransferRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(), base: mobileOwnershipTransferBaseSchema }).strict()
  .refine(value => value.base.actor.id === value.memberId && value.base.actor.profileId === value.userId && value.base.actor.teamId === value.teamId, 'The original owner must match the selected actor.');
export type MobileOwnershipTransferRequest = z.infer<typeof mobileOwnershipTransferRequestSchema>;
export const mobileOwnershipTransferReceiptSchema = z.object({ version: z.literal(2), request: mobileOwnershipTransferRequestSchema, status: z.enum(['applied', 'conflict', 'missing']),
  current: mobileOwnershipTransferCurrentSchema, recordedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => {
  const { current, request } = value; const base = request.base;
  if (current.actor.id !== request.memberId || current.actor.profileId !== request.userId || current.actor.teamId !== request.teamId || current.actor.createdAt !== base.actor.createdAt) return false;
  if (current.target && (current.target.id !== base.target.id || current.target.teamId !== request.teamId)) return false;
  if (value.status === 'missing') return current.target === null && current.ownerId === base.ownerId && JSON.stringify(current.actor) === JSON.stringify(base.actor);
  if (!current.target) return false;
  if (value.status === 'conflict') return JSON.stringify(current) !== JSON.stringify(base) && current.ownerId === base.ownerId && JSON.stringify(current.actor) === JSON.stringify(base.actor);
  return current.ownerId === base.target.profileId && JSON.stringify(current.actor) === JSON.stringify({ ...base.actor, role: 'admin', customRoleId: null })
    && JSON.stringify(current.target) === JSON.stringify({ ...base.target, role: 'owner', customRoleId: null });
}, 'The receipt must confirm the exact ownership transition or changed target.');
export type MobileOwnershipTransferReceipt = z.infer<typeof mobileOwnershipTransferReceiptSchema>;
export const mobileOwnershipTransferResponseSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, receipt: mobileOwnershipTransferReceiptSchema }).strict()
  .refine(value => value.identity.userId === value.receipt.current.actor.profileId && value.identity.memberId === value.receipt.current.actor.id && value.identity.teamId === value.receipt.current.actor.teamId && value.identity.role === value.receipt.current.actor.role, 'The fresh identity must match the current actor.');
export type MobileOwnershipTransferResponse = z.infer<typeof mobileOwnershipTransferResponseSchema>;
export const mobileOwnershipTransferQuerySchema = z.object({ targetMemberId: z.uuid(), requestNonce: z.uuid().optional() }).strict();
export type MobileOwnershipTransferQuery = z.infer<typeof mobileOwnershipTransferQuerySchema>;
export const mobileOwnershipTransferStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, targetMemberId: z.uuid(), requestNonce: z.uuid().nullable(),
  current: mobileOwnershipTransferCurrentSchema, fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.identity.userId === value.current.actor.profileId && value.identity.memberId === value.current.actor.id && value.identity.teamId === value.current.actor.teamId && value.identity.role === value.current.actor.role
  && value.current.actor.status === 'active' && (value.current.target === null || value.current.target.id === value.targetMemberId), 'The current ownership state must match the selected actor and target.');
export type MobileOwnershipTransferState = z.infer<typeof mobileOwnershipTransferStateSchema>;
function sameActor(expected: MobileIdentity, actual: MobileIdentity) {
  if (expected.userId !== actual.userId || expected.teamId !== actual.teamId || expected.memberId !== actual.memberId) throw new Error('Reopen the original account and membership for this ownership transfer.');
}
export function assertOwnershipTransferScope(identity: MobileIdentity, request: Pick<MobileOwnershipTransferRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (identity.userId !== request.userId || identity.teamId !== request.teamId || identity.memberId !== request.memberId) throw new Error('The saved ownership transfer belongs to another actor membership.');
}
export function assertOwnershipTransferWriteScope(identity: MobileIdentity, request?: Pick<MobileOwnershipTransferRequest, 'userId' | 'teamId' | 'memberId'>) {
  assertRolePermissionOverrideScope(identity, request);
}
export function assertMobileOwnershipTransferReceipt(identity: MobileIdentity, request: MobileOwnershipTransferRequest, value: unknown): MobileOwnershipTransferReceipt {
  request = mobileOwnershipTransferRequestSchema.parse(request); const result = mobileOwnershipTransferReceiptSchema.parse(value); assertOwnershipTransferScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable ownership transfer.');
  return result;
}
export function assertMobileOwnershipTransferResponse(identity: MobileIdentity, request: MobileOwnershipTransferRequest, value: unknown): MobileOwnershipTransferResponse {
  const result = mobileOwnershipTransferResponseSchema.parse(value); sameActor(identity, result.identity); assertMobileOwnershipTransferReceipt(identity, request, result.receipt);
  if (result.receipt.status !== 'applied') assertOwnershipTransferWriteScope(result.identity, request);
  return result;
}
export function assertMobileOwnershipTransferState(identity: MobileIdentity, input: MobileOwnershipTransferQuery, value: unknown): MobileOwnershipTransferState {
  input = mobileOwnershipTransferQuerySchema.parse(input); const result = mobileOwnershipTransferStateSchema.parse(value); sameActor(identity, result.identity);
  if (result.targetMemberId !== input.targetMemberId || result.requestNonce !== (input.requestNonce ?? null)) throw new Error('The ownership state belongs to another target or saved transfer.');
  if (result.requestNonce === null) assertOwnershipTransferWriteScope(result.identity);
  else if (result.identity.role === 'admin' && (result.current.actor.customRoleId !== null || result.current.target?.role !== 'owner' || result.current.target.customRoleId !== null || result.current.ownerId !== result.current.target.profileId)) throw new Error('The sealed transfer recovery no longer matches the current ownership result.');
  else if (result.identity.role !== 'admin') assertOwnershipTransferWriteScope(result.identity);
  return result;
}
