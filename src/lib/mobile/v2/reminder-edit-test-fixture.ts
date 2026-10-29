import type { MobileIdentity } from '../contracts';
import type { ReminderEditBase, MobileReminderEditReceipt, MobileReminderEditRequest, MobileReminderManagementPage, MobileReminderManagementCache } from './reminder-edit';
export const reminderEditId = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const reminderEditIdentity: MobileIdentity = { userId: reminderEditId(1), teamId: reminderEditId(2), memberId: reminderEditId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const reminderEditBase: ReminderEditBase = { kind: 'group', id: reminderEditId(4), title: 'Original reminder', body: 'Full reminder body', priority: 'normal', eventId: null, targetPath: '/reminders',
  targetRole: null, targetProfileId: null, targetLabel: 'Everyone', createdBy: reminderEditIdentity.userId, createdAt: '2026-10-22T00:00:00Z', firstScheduledFor: '2026-10-24T16:00:00Z', lastScheduledFor: '2026-10-31T16:00:00Z',
  recurrenceRule: 'weekly', occurrences: 2, recipientCount: 3, rowCount: 6, fingerprint: 'a'.repeat(64) };
export const reminderEditRequest: Extract<MobileReminderEditRequest, { action: 'edit' }> = { version: 2, userId: reminderEditIdentity.userId, teamId: reminderEditIdentity.teamId, memberId: reminderEditIdentity.memberId,
  requestNonce: reminderEditId(5), target: { kind: reminderEditBase.kind, id: reminderEditBase.id }, action: 'edit', base: reminderEditBase, value: { title: 'Updated reminder', body: 'Updated full body', priority: 'important' } };
export const reminderEditReceipt: MobileReminderEditReceipt = { version: 2, request: reminderEditRequest, status: 'applied', current: { ...reminderEditBase, ...reminderEditRequest.value, fingerprint: 'b'.repeat(64) }, affectedCount: 6, recordedAt: '2026-10-22T01:00:00Z' };
export const reminderManagementPage: MobileReminderManagementPage = { version: 2, identity: reminderEditIdentity, items: [reminderEditBase], asOf: '2026-10-22T02:00:00Z', fetchedAt: '2026-10-22T02:01:00Z', nextCursor: { after: `group:${reminderEditBase.id}`, asOf: '2026-10-22T02:00:00Z' } };
export const reminderManagementCache: MobileReminderManagementCache = { version: 2, identity: reminderEditIdentity, items: [reminderEditBase], fetchedAt: '2026-10-22T02:01:00Z' };
