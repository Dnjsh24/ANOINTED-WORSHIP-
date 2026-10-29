import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { editablePermissions } from '../../domain/permission-overrides';
import { memberRoleAssignmentSnapshotSchema } from './member-role-assignment';
import { assertRolePermissionOverrideScope } from './role-permission-override';
import { assertTeamNoticesIdentity } from './team-notices';
export const MOBILE_PERSON_PERMISSION_OVERRIDE_MAX_BYTES = 32768;
export const mobilePersonPermissionOverrideQuerySchema = z.object({ targetMemberId: z.uuid(), permission: z.enum(editablePermissions) }).strict();
export type MobilePersonPermissionOverrideQuery = z.infer<typeof mobilePersonPermissionOverrideQuerySchema>;
export const mobilePersonPermissionOverrideRowSchema = z.object({ id: z.uuid(), teamId: z.uuid(), memberId: z.uuid(),
  permission: z.enum(editablePermissions), allowed: z.boolean(), createdAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobilePersonPermissionOverrideRow = z.infer<typeof mobilePersonPermissionOverrideRowSchema>;
export const mobilePersonPermissionOverrideSelectionSchema = z.object({ member: memberRoleAssignmentSnapshotSchema, override: mobilePersonPermissionOverrideRowSchema.nullable() }).strict()
  .refine(value => !value.override || value.override.memberId === value.member.id && value.override.teamId === value.member.teamId, 'The override must belong to the exact selected membership.');
export type MobilePersonPermissionOverrideSelection = z.infer<typeof mobilePersonPermissionOverrideSelectionSchema>;
export const mobilePersonPermissionOverrideRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: mobilePersonPermissionOverrideSelectionSchema, permission: z.enum(editablePermissions), value: z.enum(['inherit', 'allow', 'deny']),
}).strict().refine(value => value.base.member.status === 'active' && value.base.member.teamId === value.teamId && (!value.base.override || value.base.override.permission === value.permission), 'Use an active selected member and matching permission slot.');
export type MobilePersonPermissionOverrideRequest = z.infer<typeof mobilePersonPermissionOverrideRequestSchema>;
export const mobilePersonPermissionOverrideReceiptSchema = z.object({ version: z.literal(2), request: mobilePersonPermissionOverrideRequestSchema,
  status: z.enum(['applied', 'conflict', 'missing']), current: mobilePersonPermissionOverrideSelectionSchema.nullable(), recordedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => {
  const current = value.current; const request = value.request;
  if (value.status === 'missing') return current === null;
  if (!current || current.member.id !== request.base.member.id || current.member.teamId !== request.teamId || current.override && current.override.permission !== request.permission) return false;
  if (value.status === 'conflict') return JSON.stringify(current) !== JSON.stringify(request.base);
  if (JSON.stringify(current.member) !== JSON.stringify(request.base.member)) return false;
  return request.value === 'inherit' ? current.override === null : current.override !== null && current.override.allowed === (request.value === 'allow');
}, 'The receipt must describe the exact selected membership and override outcome.');
export type MobilePersonPermissionOverrideReceipt = z.infer<typeof mobilePersonPermissionOverrideReceiptSchema>;
export const mobilePersonPermissionOverrideStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  ...mobilePersonPermissionOverrideQuerySchema.shape, current: mobilePersonPermissionOverrideSelectionSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.current === null || value.current.member.id === value.targetMemberId && value.current.member.teamId === value.identity.teamId && (!value.current.override || value.current.override.permission === value.permission), 'The current selection must match the requested member and permission.');
export type MobilePersonPermissionOverrideState = z.infer<typeof mobilePersonPermissionOverrideStateSchema>;
export function assertPersonPermissionOverrideScope(identity: MobileIdentity, request?: MobilePersonPermissionOverrideRequest) {
  assertRolePermissionOverrideScope(identity, request);
  if (request && (request.base.member.id === identity.memberId || request.base.member.profileId === identity.userId || request.base.member.role === 'owner')) throw new Error('Choose another non-owner membership for person permissions.');
}
export function assertMobilePersonPermissionOverrideReceipt(identity: MobileIdentity, request: MobilePersonPermissionOverrideRequest, value: unknown): MobilePersonPermissionOverrideReceipt {
  request = mobilePersonPermissionOverrideRequestSchema.parse(request); const result = mobilePersonPermissionOverrideReceiptSchema.parse(value); assertPersonPermissionOverrideScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable person permission override.');
  return result;
}
export function assertMobilePersonPermissionOverrideState(identity: MobileIdentity, input: MobilePersonPermissionOverrideQuery, value: unknown): MobilePersonPermissionOverrideState {
  input = mobilePersonPermissionOverrideQuerySchema.parse(input); const result = mobilePersonPermissionOverrideStateSchema.parse(value);
  assertPersonPermissionOverrideScope(identity); assertTeamNoticesIdentity(identity, result.identity);
  if (result.targetMemberId !== input.targetMemberId || result.permission !== input.permission) throw new Error('The person permission state belongs to another selected member or permission.');
  return result;
}
