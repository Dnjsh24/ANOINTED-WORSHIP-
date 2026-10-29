import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';
import { announcementEditTargetSchema } from './announcement-edit';
import { assertTeamNoticesIdentity } from './team-notices';
import { buildReminderOccurrences } from '../../domain/reminder-schedule';

export const MOBILE_REMINDER_EDIT_MAX_BYTES = 65536;
export const MOBILE_REMINDER_MANAGEMENT_PAGE_SIZE = 100;
export const MOBILE_REMINDER_MANAGEMENT_CACHE_LIMIT = 5000;
export const MOBILE_REMINDER_ROW_LIMIT = 60000;
const time = z.iso.datetime({ offset: true });
const priority = z.enum(['normal', 'important', 'urgent']);
const recurrence = z.enum(['none', 'weekly', 'monthly']);
const count = z.number().int().min(1);
export const reminderEditTargetSchema = z.object({ kind: z.enum(['group', 'legacy']), id: z.uuid() }).strict();
const path = z.string().max(200).regex(/^\/(?:reminders|dashboard|announcements|profile|members|messages|dance|songs|setlists|events)(?:\/[0-9a-fA-F-]{36})?$/);
const content = z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(2000), priority }).strict();
export const reminderEditContentSchema = content.refine(value => value.title.trim() === value.title && value.body.trim() === value.body, 'Trim reminder fields before saving.');
export const reminderEditBaseSchema = reminderEditTargetSchema.extend({ title: z.string().max(160), body: z.string().max(2000).nullable(), priority,
  eventId: z.uuid().nullable(), targetPath: z.string().max(200).nullable(), targetRole: z.enum(teamRoles).nullable(), targetProfileId: z.uuid().nullable(), targetLabel: z.string().max(254),
  createdBy: z.uuid().nullable(), createdAt: time, firstScheduledFor: time, lastScheduledFor: time, recurrenceRule: recurrence,
  occurrences: count.max(12), recipientCount: count.max(5000), rowCount: count.max(MOBILE_REMINDER_ROW_LIMIT), fingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
  .refine(value => (value.targetRole === null || value.targetProfileId === null) && Date.parse(value.firstScheduledFor) <= Date.parse(value.lastScheduledFor)
    && value.occurrences <= value.rowCount && value.recipientCount <= value.rowCount && (value.kind !== 'legacy' || value.rowCount === 1), 'Invalid complete reminder group.');
export type ReminderEditBase = z.infer<typeof reminderEditBaseSchema>;
const common = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(), target: reminderEditTargetSchema }).strict();
export const mobileReminderEditRequestSchema = z.discriminatedUnion('action', [
  common.extend({ action: z.literal('create'), target: z.object({ kind: z.literal('group'), id: z.uuid() }).strict(), base: z.null(),
    value: content.extend({ eventId: z.uuid().nullable(), targetPath: path, scheduledFor: z.iso.date().nullable(), recurrence, occurrences: count.max(12), target: announcementEditTargetSchema }).strict()
      .refine(value => value.title.trim() === value.title && value.body.trim() === value.body, 'Trim reminder fields before saving.')
      .refine(value => { try { buildReminderOccurrences({ ...value, now: '2026-01-01T00:00:00Z' }); return true; } catch { return false; } }, 'Choose a representable Manila schedule.') }).strict(),
  common.extend({ action: z.literal('edit'), base: reminderEditBaseSchema, value: reminderEditContentSchema }).strict(),
  common.extend({ action: z.literal('delete'), base: reminderEditBaseSchema }).strict(),
]).refine(value => value.base === null || value.target.id === value.base.id && value.target.kind === value.base.kind, 'Reminder base belongs to another group.');
export type MobileReminderEditRequest = z.infer<typeof mobileReminderEditRequestSchema>;
export const mobileReminderEditReceiptSchema = z.object({ version: z.literal(2), request: mobileReminderEditRequestSchema, status: z.enum(['applied', 'conflict', 'missing']),
  current: reminderEditBaseSchema.nullable(), affectedCount: z.number().int().min(0).max(MOBILE_REMINDER_ROW_LIMIT), recordedAt: time }).strict();
export type MobileReminderEditReceipt = z.infer<typeof mobileReminderEditReceiptSchema>;
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.entries(left); return a.length === Object.keys(right).length && a.every(([key, value]) => Object.hasOwn(right, key) && same(value, (right as Record<string, unknown>)[key]));
}
function stableFields(base: ReminderEditBase) {
  return { ...base, fingerprint: '', createdAt: Date.parse(base.createdAt), firstScheduledFor: Date.parse(base.firstScheduledFor), lastScheduledFor: Date.parse(base.lastScheduledFor) };
}
export function assertReminderEditScope(identity: MobileIdentity, request?: { userId: string; teamId: string; memberId: string }) {
  if (!['owner', 'admin'].includes(identity.role) || !identity.permissions.includes('members.manage')
    || request && (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId)) throw new Error('Current matching owner/admin reminder management authority is required.');
}
export function assertMobileReminderEditReceipt(identity: MobileIdentity, request: MobileReminderEditRequest, value: unknown): MobileReminderEditReceipt {
  request = mobileReminderEditRequestSchema.parse(request); const receipt = mobileReminderEditReceiptSchema.parse(value); assertReminderEditScope(identity, request);
  if (!same(request, receipt.request)) throw new Error('The receipt belongs to another immutable reminder intent.');
  const current = receipt.current;
  if (current && (current.kind !== request.target.kind || current.id !== request.target.id)) throw new Error('Reminder receipt target changed.');
  if (receipt.status !== 'applied') {
    if (receipt.affectedCount !== 0 || (receipt.status === 'missing' ? request.action === 'create' || current !== null : !current || request.base && current.fingerprint === request.base.fingerprint)) throw new Error('Unconfirmed reminder change cannot claim affected rows.');
  } else if (request.action === 'delete') {
    if (current !== null || receipt.affectedCount !== request.base.rowCount) throw new Error('Whole-group removal was not confirmed.');
  } else if (request.action === 'edit') {
    const unchanged = request.value.title === request.base.title && request.value.body === request.base.body && request.value.priority === request.base.priority;
    if (!current || receipt.affectedCount !== (unchanged ? 0 : request.base.rowCount) || (unchanged ? current.fingerprint !== request.base.fingerprint : current.fingerprint === request.base.fingerprint)
      || !same(stableFields(current), stableFields({ ...request.base, ...request.value }))) throw new Error('Exact content-only group edit was not confirmed.');
  } else {
    const audience = request.value.target; const total = request.value.recurrence === 'none' ? 1 : request.value.occurrences;
    if (current) {
      const expected = buildReminderOccurrences({ recurrence: request.value.recurrence, scheduledFor: request.value.scheduledFor, occurrences: request.value.occurrences, now: current.createdAt });
      if (Date.parse(current.firstScheduledFor) !== Date.parse(expected[0].scheduledFor) || Date.parse(current.lastScheduledFor) !== Date.parse(expected.at(-1)!.scheduledFor)) throw new Error('The reminder schedule does not match the saved Manila calendar dates.');
    }
    if (!current || current.title !== request.value.title || current.body !== request.value.body || current.priority !== request.value.priority || current.eventId !== request.value.eventId
      || current.targetPath !== (request.value.eventId ? `/events/${request.value.eventId}` : request.value.targetPath) || current.createdBy !== identity.userId || current.recurrenceRule !== request.value.recurrence
      || current.occurrences !== total || current.rowCount !== current.recipientCount * total || receipt.affectedCount !== current.rowCount
      || audience.kind === 'all' && (current.targetRole !== null || current.targetProfileId !== null)
      || audience.kind === 'role' && (current.targetRole !== audience.role || current.targetProfileId !== null)
      || audience.kind === 'person' && (current.targetRole !== null || current.targetProfileId === null || current.recipientCount !== 1)) throw new Error('Created reminders do not match the saved intent.');
  }
  return receipt;
}
const after = z.string().regex(/^(group|legacy):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
export const mobileReminderManagementRequestSchema = z.object({ after: after.optional(), asOf: time.optional() }).strict().refine(value => !value.after || Boolean(value.asOf), 'A cursor requires its original cutoff.');
export type MobileReminderManagementRequest = z.infer<typeof mobileReminderManagementRequestSchema>;
const shared = { version: z.literal(2), identity: mobileIdentitySchema, fetchedAt: time };
export const mobileReminderManagementPageSchema = z.object({ ...shared, asOf: time, items: z.array(reminderEditBaseSchema).max(MOBILE_REMINDER_MANAGEMENT_PAGE_SIZE), nextCursor: z.object({ after, asOf: time }).strict().nullable() }).strict();
export type MobileReminderManagementPage = z.infer<typeof mobileReminderManagementPageSchema>;
export const mobileReminderManagementCacheSchema = z.object({ ...shared, items: z.array(reminderEditBaseSchema).max(MOBILE_REMINDER_MANAGEMENT_CACHE_LIMIT) }).strict()
  .refine(value => new Set(value.items.map(item => `${item.kind}:${item.id}`)).size === value.items.length, 'Duplicate reminder groups.');
export type MobileReminderManagementCache = z.infer<typeof mobileReminderManagementCacheSchema>;
export function assertMobileReminderManagementCache(identity: MobileIdentity, value: unknown): MobileReminderManagementCache {
  const result = mobileReminderManagementCacheSchema.parse(value); assertReminderEditScope(identity); assertReminderEditScope(result.identity); assertTeamNoticesIdentity(identity, result.identity); return result;
}
export function assertMobileReminderManagementPage(identity: MobileIdentity, input: MobileReminderManagementRequest, value: unknown): MobileReminderManagementPage {
  input = mobileReminderManagementRequestSchema.parse(input); const result = mobileReminderManagementPageSchema.parse(value); assertReminderEditScope(identity); assertReminderEditScope(result.identity); assertTeamNoticesIdentity(identity, result.identity);
  const keys = result.items.map(item => `${item.kind}:${item.id}`);
  if (input.asOf && input.asOf !== result.asOf || result.items.reduce((total, item) => total + item.rowCount, 0) > MOBILE_REMINDER_ROW_LIMIT
    || result.items.some((item, index) => Date.parse(item.createdAt) > Date.parse(result.asOf) || input.after && keys[index] <= input.after || index > 0 && keys[index] <= keys[index - 1])
    || result.nextCursor && (!keys.length || result.nextCursor.after !== keys.at(-1) || result.nextCursor.asOf !== result.asOf)) throw new Error('Reminder management cutoff, completeness or cursor changed.');
  return result;
}
