import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';
import { editablePermissions } from '../../domain/permission-overrides';
import { assertTeamNoticesIdentity } from './team-notices';
export const MOBILE_ROLE_PERMISSION_OVERRIDE_MAX_BYTES = 32768;
export const mobileRolePermissionOverrideQuerySchema = z.object({ targetRole: z.enum(teamRoles).exclude(['owner']), permission: z.enum(editablePermissions) }).strict();
export type MobileRolePermissionOverrideQuery = z.infer<typeof mobileRolePermissionOverrideQuerySchema>;
export const mobileRolePermissionOverrideRowSchema = z.object({ id: z.uuid(), teamId: z.uuid(), role: z.enum(teamRoles).exclude(['owner']),
  permission: z.enum(editablePermissions), allowed: z.boolean(), createdAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobileRolePermissionOverrideRow = z.infer<typeof mobileRolePermissionOverrideRowSchema>;
export const mobileRolePermissionOverrideRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  ...mobileRolePermissionOverrideQuerySchema.shape, base: mobileRolePermissionOverrideRowSchema.nullable(), value: z.enum(['inherit', 'allow', 'deny']),
}).strict().refine(value => value.base === null || value.base.teamId === value.teamId && value.base.role === value.targetRole && value.base.permission === value.permission, 'The saved override must match the selected role and permission.');
export type MobileRolePermissionOverrideRequest = z.infer<typeof mobileRolePermissionOverrideRequestSchema>;
export const mobileRolePermissionOverrideReceiptSchema = z.object({ version: z.literal(2), request: mobileRolePermissionOverrideRequestSchema,
  status: z.enum(['applied', 'conflict']), current: mobileRolePermissionOverrideRowSchema.nullable(), recordedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => {
  const current = value.current; const request = value.request;
  if (current && (current.teamId !== request.teamId || current.role !== request.targetRole || current.permission !== request.permission)) return false;
  if (value.status === 'conflict') return JSON.stringify(current) !== JSON.stringify(request.base);
  return request.value === 'inherit' ? current === null : current !== null && current.allowed === (request.value === 'allow');
}, 'The receipt must describe the exact selected override and outcome.');
export type MobileRolePermissionOverrideReceipt = z.infer<typeof mobileRolePermissionOverrideReceiptSchema>;
export const mobileRolePermissionOverrideStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  ...mobileRolePermissionOverrideQuerySchema.shape, current: mobileRolePermissionOverrideRowSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.current === null || value.current.teamId === value.identity.teamId && value.current.role === value.targetRole && value.current.permission === value.permission, 'The current override must match the selected role and permission.');
export type MobileRolePermissionOverrideState = z.infer<typeof mobileRolePermissionOverrideStateSchema>;
export function assertRolePermissionOverrideScope(identity: MobileIdentity, request: Pick<MobileRolePermissionOverrideRequest, 'userId' | 'teamId' | 'memberId'> = identity) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || identity.role !== 'owner' || !identity.permissions.includes('team.manage')) throw new Error('Current matching owner and team-management authority is required.');
}
export function assertMobileRolePermissionOverrideReceipt(identity: MobileIdentity, request: MobileRolePermissionOverrideRequest, value: unknown): MobileRolePermissionOverrideReceipt {
  request = mobileRolePermissionOverrideRequestSchema.parse(request); const result = mobileRolePermissionOverrideReceiptSchema.parse(value); assertRolePermissionOverrideScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable role permission override.');
  return result;
}
export function assertMobileRolePermissionOverrideState(identity: MobileIdentity, input: MobileRolePermissionOverrideQuery, value: unknown): MobileRolePermissionOverrideState {
  input = mobileRolePermissionOverrideQuerySchema.parse(input); const result = mobileRolePermissionOverrideStateSchema.parse(value);
  assertRolePermissionOverrideScope(identity); assertTeamNoticesIdentity(identity, result.identity);
  if (result.targetRole !== input.targetRole || result.permission !== input.permission) throw new Error('The override state belongs to another selected role or permission.');
  return result;
}
