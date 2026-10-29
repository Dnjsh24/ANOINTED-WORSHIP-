import { z } from 'zod';
import { usageDateRangeIsValid } from '../../domain/member-usage';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { assertAnalyticsIdentity } from './analytics';

export const MOBILE_MEMBER_USAGE_ROW_LIMIT = 50000;
export const MOBILE_MEMBER_USAGE_NAME_LIMIT = 5000;
const date = z.string().refine(value => usageDateRangeIsValid(value, value), 'A real UTC calendar date is required.');
export const mobileMemberUsageRequestSchema = z.object({ start: date, end: date }).strict()
  .refine(value => usageDateRangeIsValid(value.start, value.end), 'Choose ordered UTC dates covering at most 366 days.');
export type MobileMemberUsageRequest = z.infer<typeof mobileMemberUsageRequestSchema>;
export const mobileMemberUsageDaySchema = z.object({ member_id: z.uuid(), team_id: z.uuid(), usage_date: date,
  active_minutes: z.number().int().min(0).max(1440), sessions: z.number().int().min(0).max(1440) }).strict();
const common = z.object({ version: z.literal(2), identity: mobileIdentitySchema, start: date, end: date, fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export const mobileMemberUsageSchema = z.discriminatedUnion('kind', [
  common.extend({ kind: z.literal('ready'), rows: z.array(mobileMemberUsageDaySchema).max(MOBILE_MEMBER_USAGE_ROW_LIMIT),
    memberNames: z.record(z.uuid(), z.string().trim().min(1).max(160)).refine(names => Object.keys(names).length <= MOBILE_MEMBER_USAGE_NAME_LIMIT, 'Too many member names.') }).strict(),
  common.extend({ kind: z.literal('unavailable'), message: z.string().min(1).max(1000) }).strict(),
]).superRefine((value, context) => {
  if (!usageDateRangeIsValid(value.start, value.end)) context.addIssue({ code: 'custom', message: 'Invalid UTC usage range.' });
  if (value.kind === 'ready') {
    const keys = new Set<string>();
    for (const row of value.rows) {
      const key = `${row.member_id}:${row.usage_date}`;
      if (row.team_id !== value.identity.teamId || row.usage_date < value.start || row.usage_date > value.end || keys.has(key)) {
        context.addIssue({ code: 'custom', message: 'Usage rows have a foreign scope, out-of-range date or duplicate day.' }); break;
      }
      keys.add(key);
    }
  }
});
export type MobileMemberUsage = z.infer<typeof mobileMemberUsageSchema>;
export function assertMobileMemberUsage(identity: MobileIdentity, input: MobileMemberUsageRequest, value: unknown): MobileMemberUsage {
  input = mobileMemberUsageRequestSchema.parse(input); const result = mobileMemberUsageSchema.parse(value); assertAnalyticsIdentity(identity, result.identity);
  if (result.start !== input.start || result.end !== input.end) throw new Error('The member usage UTC dates changed.');
  return result;
}
