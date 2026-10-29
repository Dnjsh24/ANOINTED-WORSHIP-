import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';

export const MOBILE_CUSTOM_ROLE_CREATE_MAX_BYTES = 32768;
export const mobileCustomRoleCreateRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  name: z.string().min(1).max(160).refine(value => value === value.trim(), 'Use a trimmed role name.'),
  permissions: mobileIdentitySchema.shape.permissions.refine(values => values.every((value, index) => index === 0 || value > values[index - 1]), 'Use unique permissions in canonical lexical order.'),
}).strict();
export type MobileCustomRoleCreateRequest = z.infer<typeof mobileCustomRoleCreateRequestSchema>;
export const mobileCustomRoleCreateReceiptSchema = z.object({ version: z.literal(2), request: mobileCustomRoleCreateRequestSchema,
  status: z.enum(['applied', 'blocked']), current: z.object({ id: z.uuid(), teamId: z.uuid(), name: z.string().min(1).max(160),
    permissions: mobileIdentitySchema.shape.permissions, createdAt: z.iso.datetime({ offset: true }) }).strict().nullable(),
  reason: z.literal('existing_role').nullable(), recordedAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobileCustomRoleCreateReceipt = z.infer<typeof mobileCustomRoleCreateReceiptSchema>;
export function assertCustomRoleCreateScope(identity: MobileIdentity, request: Pick<MobileCustomRoleCreateRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || identity.role !== 'owner' || !identity.permissions.includes('team.manage')) throw new Error('Current matching owner and team-management authority is required.');
}
export function assertMobileCustomRoleCreateReceipt(identity: MobileIdentity, request: MobileCustomRoleCreateRequest, value: unknown): MobileCustomRoleCreateReceipt {
  request = mobileCustomRoleCreateRequestSchema.parse(request); const result = mobileCustomRoleCreateReceiptSchema.parse(value); assertCustomRoleCreateScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable custom-role creation.');
  const current = result.current;
  if (result.status === 'blocked') {
    if (result.reason !== 'existing_role' || current !== null) throw new Error('A duplicate role must remain unchanged without claiming creation.');
  } else if (result.reason !== null || !current || current.teamId !== request.teamId || current.name !== request.name || JSON.stringify(current.permissions) !== JSON.stringify(request.permissions)
    || Date.parse(current.createdAt) > Date.parse(result.recordedAt)) throw new Error('The exact unassigned custom role was not confirmed.');
  return result;
}
