import { z } from 'zod';
import { addAnalyticsDays, parseAnalyticsRange, type AnalyticsData } from '../../domain/analytics';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'A real calendar date is required.');
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(1000);
const timestamp = z.iso.datetime({ offset: true });
export const mobileAnalyticsRequestSchema = z.object({ start: date.optional(), end: date.optional() }).strict();
export type MobileAnalyticsRequest = z.infer<typeof mobileAnalyticsRequestSchema>;
const rangeSchema = z.object({ start: date, end: date, previousStart: date, previousEnd: date, days: z.number().int().min(1).max(365), today: date,
  timeZone: z.literal('Asia/Manila'), notice: text.nullable() }).strict().refine(range => range.end <= range.today && range.start <= range.end
  && addAnalyticsDays(range.start, range.days - 1) === range.end && addAnalyticsDays(range.start, -range.days) === range.previousStart
  && addAnalyticsDays(range.start, -1) === range.previousEnd, 'Invalid analytics comparison range.');
const summary = z.object({ available: count, total: count, rate: z.number().min(0).max(100).nullable(), eventCount: count }).strict();
function validSummary(value: z.infer<typeof summary>) {
  return value.available <= value.total && (value.total === 0 ? value.rate === null : value.rate !== null && Math.abs(value.rate - value.available / value.total * 100) < 0.000001);
}
const availabilitySummary = summary.refine(validSummary, 'Invalid availability rate.');
const eventType = z.enum(['service', 'special_event', 'rehearsal', 'meeting', 'service_rehearsal']);
const availability = z.object({ current: availabilitySummary, previous: availabilitySummary,
  byEventType: z.array(summary.extend({ type: eventType, label: text }).strict().refine(validSummary)).max(5),
  daily: z.array(summary.extend({ date }).strict().refine(validSummary)).max(730) }).strict()
  .refine(value => new Set(value.byEventType.map(item => item.type)).size === value.byEventType.length, 'Duplicate event types.');
const source = <T extends z.ZodType>(data: T) => z.discriminatedUnion('status', [z.object({ status: z.literal('ready'), data }).strict(), z.object({ status: z.literal('unavailable'), message: text }).strict()]);
const unique = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length;
const songs = z.array(z.object({ id: z.uuid(), title: text, count, previousCount: count }).strict()).max(50000).refine(unique);
const messages = z.array(z.object({ id: z.uuid(), name: text, count, previousCount: count }).strict()).max(50000).refine(unique);
const activity = z.array(z.object({ id: z.uuid(), createdAt: timestamp, category: z.string().min(1).max(80), description: text, actor: text }).strict()).max(50).refine(unique);
export const MOBILE_ANALYTICS_TOTALS = [
  { id: 'songs', label: 'Songs', href: '/songs' }, { id: 'setlists', label: 'Setlists', href: '/setlists' },
  { id: 'events', label: 'Approved events', href: '/events' }, { id: 'members', label: 'Active members', href: '/members' },
  { id: 'channels', label: 'Message channels', href: '/messages' }, { id: 'announcements', label: 'Announcements', href: '/announcements' },
  { id: 'dance', label: 'Dance charts', href: '/dance' }, { id: 'requests', label: 'Pending join requests', href: '/members/requests' },
] as const;
const total = z.object({ id: text, label: text, href: text, value: count.nullable(), message: text.nullable() }).strict()
  .refine(value => value.value === null ? value.message !== null : value.message === null, 'An unavailable count needs an explanation.');
export const mobileAnalyticsDataSchema = z.object({ mode: z.literal('live'), range: rangeSchema, songs: source(songs), availability: source(availability),
  messages: source(messages), activity: source(activity), totals: z.array(total).length(8) }).strict().superRefine((value, context) => {
  if (value.totals.some((item, index) => { const expected = MOBILE_ANALYTICS_TOTALS[index]; return item.id !== expected.id || item.label !== expected.label || item.href !== expected.href; })) context.addIssue({ code: 'custom', message: 'Only website analytics destinations are allowed.' });
  if (value.availability.status === 'ready') {
    const daily = value.availability.data.daily;
    if (daily.length !== value.range.days * 2 || daily.some((day, index) => day.date !== addAnalyticsDays(value.range.previousStart, index))) context.addIssue({ code: 'custom', message: 'Availability days are incomplete.' });
  }
}) satisfies z.ZodType<AnalyticsData>;
export const mobileAnalyticsSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, analytics: mobileAnalyticsDataSchema, fetchedAt: timestamp }).strict();
export type MobileAnalytics = z.infer<typeof mobileAnalyticsSchema>;
export function assertAnalyticsIdentity(identity: MobileIdentity, actual: MobileIdentity) {
  const allowed = (actor: MobileIdentity) => actor.role === 'owner' || actor.role === 'admin';
  const permissions = (actor: MobileIdentity) => [...new Set(actor.permissions)].sort().join(',');
  if (!allowed(identity) || !allowed(actual)) throw new Error('An active owner or admin membership is required.');
  if (identity.userId !== actual.userId || identity.teamId !== actual.teamId || identity.memberId !== actual.memberId || identity.role !== actual.role || permissions(identity) !== permissions(actual)) throw new Error('Analytics account, team or current authority changed.');
}
export function assertMobileAnalytics(identity: MobileIdentity, input: MobileAnalyticsRequest, value: unknown): MobileAnalytics {
  input = mobileAnalyticsRequestSchema.parse(input); const result = mobileAnalyticsSchema.parse(value); assertAnalyticsIdentity(identity, result.identity);
  const expected = parseAnalyticsRange(input, new Date(result.fetchedAt));
  if (Object.keys(expected).some(key => expected[key as keyof typeof expected] !== result.analytics.range[key as keyof typeof expected])) throw new Error('The analytics range does not match the requested Manila dates.');
  return result;
}
