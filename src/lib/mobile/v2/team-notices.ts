import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_TEAM_NOTICES_PAGE_SIZE = 100;
export const MOBILE_TEAM_NOTICES_CACHE_LIMIT = 5000;
const time = z.iso.datetime({ offset: true });
const priority = z.enum(['normal', 'important', 'urgent']);
const target = { targetLabel: z.string().max(254), targetRole: z.enum(teamRoles).nullable(), targetProfileId: z.uuid().nullable() };
const common = { id: z.uuid(), title: z.string().max(160), priority, createdAt: time, createdBy: z.uuid().nullable(), eventId: z.uuid().nullable() };
export const mobileAnnouncementSchema = z.object({ ...common, ...target, body: z.string().max(3000), category: z.string().max(80), isPinned: z.boolean(),
  eventName: z.string().max(160).nullable(), acknowledgedByMe: z.boolean() }).strict();
export const mobileReminderSchema = z.object({ ...common, ...target, body: z.string().max(2000).nullable(), targetPath: z.string().max(1000).nullable(),
  readAt: time.nullable(), acknowledgedAt: time.nullable(), scheduledFor: time, recurrenceRule: z.enum(['none', 'weekly', 'monthly']),
  recurrenceIndex: z.number().int().min(0).max(1000), recurrenceTotal: z.number().int().min(1).max(1001), noticeGroupId: z.uuid().nullable(),
}).strict().refine(row => row.recurrenceIndex < row.recurrenceTotal, 'Invalid reminder recurrence index.');
export type MobileAnnouncement = z.infer<typeof mobileAnnouncementSchema>;
export type MobileReminder = z.infer<typeof mobileReminderSchema>;
export const mobileTeamNoticesRequestSchema = z.object({ kind: z.enum(['announcements', 'reminders']), after: z.uuid().optional(), asOf: time.optional() }).strict();
export type MobileTeamNoticesRequest = z.infer<typeof mobileTeamNoticesRequestSchema>;
const cursor = z.object({ after: z.uuid(), asOf: time }).strict().nullable();
const page = { version: z.literal(2), identity: mobileIdentitySchema, asOf: time, fetchedAt: time, nextCursor: cursor };
export const mobileTeamNoticesPageSchema = z.discriminatedUnion('kind', [
  z.object({ ...page, kind: z.literal('announcements'), items: z.array(mobileAnnouncementSchema).max(MOBILE_TEAM_NOTICES_PAGE_SIZE) }).strict(),
  z.object({ ...page, kind: z.literal('reminders'), items: z.array(mobileReminderSchema).max(MOBILE_TEAM_NOTICES_PAGE_SIZE) }).strict(),
]);
export type MobileTeamNoticesPage = z.infer<typeof mobileTeamNoticesPageSchema>;
const cache = { version: z.literal(2), identity: mobileIdentitySchema, fetchedAt: time };
export const mobileTeamNoticesCacheSchema = z.discriminatedUnion('kind', [
  z.object({ ...cache, kind: z.literal('announcements'), items: z.array(mobileAnnouncementSchema).max(MOBILE_TEAM_NOTICES_CACHE_LIMIT) }).strict(),
  z.object({ ...cache, kind: z.literal('reminders'), items: z.array(mobileReminderSchema).max(MOBILE_TEAM_NOTICES_CACHE_LIMIT) }).strict(),
]).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Duplicate notice IDs.');
export type MobileTeamNoticesCache = z.infer<typeof mobileTeamNoticesCacheSchema>;
export function assertTeamNoticesIdentity(identity: MobileIdentity, actual: MobileIdentity) {
  const permissions = (value: MobileIdentity) => [...new Set(value.permissions)].sort().join(',');
  if (identity.userId !== actual.userId || identity.teamId !== actual.teamId || identity.memberId !== actual.memberId
    || identity.role !== actual.role || permissions(identity) !== permissions(actual)) throw new Error('Reopen the matching team and current notice permissions.');
}
export function assertMobileTeamNoticesCache(identity: MobileIdentity, value: unknown): MobileTeamNoticesCache {
  const parsed = mobileTeamNoticesCacheSchema.parse(value); assertTeamNoticesIdentity(identity, parsed.identity); return parsed;
}
export function assertMobileTeamNoticesPage(identity: MobileIdentity, input: MobileTeamNoticesRequest, value: unknown): MobileTeamNoticesPage {
  const parsed = mobileTeamNoticesPageSchema.parse(value); assertTeamNoticesIdentity(identity, parsed.identity);
  if (parsed.kind !== input.kind || (input.asOf && parsed.asOf !== input.asOf)
    || parsed.items.some((item, index) => (input.after && item.id <= input.after) || (index > 0 && item.id <= parsed.items[index - 1].id))
    || (parsed.nextCursor && (!parsed.items.length || parsed.nextCursor.after !== parsed.items.at(-1)?.id || parsed.nextCursor.asOf !== parsed.asOf))) throw new Error('The notice page changed scope or ordering. Retry the download.');
  return parsed;
}
