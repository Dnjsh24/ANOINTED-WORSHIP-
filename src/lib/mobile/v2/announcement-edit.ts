import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_ANNOUNCEMENT_EDIT_MAX_BYTES = 65536;
const content = z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(3000), category: z.string().min(1).max(80), priority: z.enum(['normal', 'important', 'urgent']) }).strict();
export const announcementEditContentSchema = content.refine(value => [value.title, value.body, value.category].every(field => field.trim() === field && field.length > 0), 'Trim announcement fields before saving.');
export const announcementEditBaseSchema = content.extend({ title: z.string().max(160), body: z.string().max(3000), category: z.string().max(80), isPinned: z.boolean(), eventId: z.uuid().nullable(), targetRole: z.enum(teamRoles).nullable(), targetProfileId: z.uuid().nullable(),
  targetLabel: z.string().max(254), createdAt: z.iso.datetime({ offset: true }), createdBy: z.uuid().nullable() }).strict()
  .refine(value => value.targetRole === null || value.targetProfileId === null, 'An announcement cannot target both a role and a person.');
export type AnnouncementEditBase = z.infer<typeof announcementEditBaseSchema>;
export const announcementEditTargetSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('role'), role: z.enum(teamRoles) }).strict(), z.object({ kind: z.literal('person'), memberId: z.uuid() }).strict()]);
const common = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(), announcementId: z.uuid() }).strict();
export const mobileAnnouncementEditRequestSchema = z.discriminatedUnion('action', [
  common.extend({ action: z.literal('create'), base: z.null(), value: content.extend({ isPinned: z.boolean(), eventId: z.uuid().nullable(), target: announcementEditTargetSchema }).strict()
    .refine(value => [value.title, value.body, value.category].every(field => field.trim() === field && field.length > 0), 'Trim announcement fields before saving.') }).strict(),
  common.extend({ action: z.literal('edit'), base: announcementEditBaseSchema, value: announcementEditContentSchema }).strict(),
  common.extend({ action: z.literal('pin'), base: announcementEditBaseSchema, isPinned: z.boolean() }).strict(),
  common.extend({ action: z.literal('delete'), base: announcementEditBaseSchema }).strict(),
]);
export type MobileAnnouncementEditRequest = z.infer<typeof mobileAnnouncementEditRequestSchema>;
export const mobileAnnouncementEditReceiptSchema = z.object({ version: z.literal(2), request: mobileAnnouncementEditRequestSchema,
  status: z.enum(['applied', 'conflict', 'missing']), current: announcementEditBaseSchema.nullable(), recordedAt: z.iso.datetime({ offset: true }) }).strict();
export type MobileAnnouncementEditReceipt = z.infer<typeof mobileAnnouncementEditReceiptSchema>;
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.entries(left); const b = Object.entries(right);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && sameValue(value, (right as Record<string, unknown>)[key]));
}
function sameBase(left: AnnouncementEditBase | null, right: AnnouncementEditBase) {
  return left !== null && sameValue({ ...left, createdAt: Date.parse(left.createdAt) }, { ...right, createdAt: Date.parse(right.createdAt) });
}
export function assertAnnouncementEditScope(identity: MobileIdentity, request: MobileAnnouncementEditRequest) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId
    || !['owner', 'admin'].includes(identity.role) || !identity.permissions.includes('members.manage')
    || ['edit', 'pin'].includes(request.action) && !identity.permissions.includes('announcements.create')) throw new Error('Current matching owner/admin announcement management authority is required.');
}
export function assertMobileAnnouncementEditReceipt(identity: MobileIdentity, request: MobileAnnouncementEditRequest, value: unknown): MobileAnnouncementEditReceipt {
  request = mobileAnnouncementEditRequestSchema.parse(request); const receipt = mobileAnnouncementEditReceiptSchema.parse(value); assertAnnouncementEditScope(identity, request);
  if (!sameValue(receipt.request, request)) throw new Error('The receipt belongs to another immutable announcement intent.');
  const current = receipt.current;
  if (receipt.status === 'missing') {
    if (request.action === 'create' || current !== null) throw new Error('An existing announcement target must be missing.');
  } else if (receipt.status === 'conflict') {
    if (current === null || request.action !== 'create' && sameBase(current, request.base)) throw new Error('A conflict requires a different current announcement.');
  } else if (request.action === 'delete') {
    if (current !== null) throw new Error('Applied deletion must confirm removal.');
  } else if (request.action === 'create') {
    const target = request.value.target;
    if (!current || current.title !== request.value.title || current.body !== request.value.body || current.category !== request.value.category || current.priority !== request.value.priority
      || current.eventId !== request.value.eventId || current.isPinned !== request.value.isPinned || current.createdBy !== identity.userId
      || target.kind === 'all' && (current.targetRole !== null || current.targetProfileId !== null)
      || target.kind === 'role' && (current.targetRole !== target.role || current.targetProfileId !== null)
      || target.kind === 'person' && (current.targetRole !== null || current.targetProfileId === null)) throw new Error('Created announcement does not match its saved intent.');
  } else if (!sameBase(current, request.action === 'edit' ? { ...request.base, ...request.value } : { ...request.base, isPinned: request.isPinned })) throw new Error('The saved announcement fields were not confirmed exactly.');
  return receipt;
}
