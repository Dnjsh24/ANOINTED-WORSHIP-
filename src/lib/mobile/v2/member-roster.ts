import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_MEMBER_ROSTER_PAGE_SIZE = 100;
export const MOBILE_MEMBER_ROSTER_CACHE_LIMIT = 5000;
const timestamp = z.iso.datetime({ offset: true });
export const mobileRosterMemberSchema = z.object({ id: z.uuid(), profileId: z.uuid(), fullName: z.string().max(160).nullable(), email: z.string().max(254).nullable(), avatarUrl: z.null(),
  role: z.enum(teamRoles), status: z.enum(['active', 'inactive']), ministry: z.string().max(160).nullable(), ministries: z.array(z.string().max(160)).max(100), createdAt: timestamp }).strict();
export type MobileRosterMember = z.infer<typeof mobileRosterMemberSchema>;
export const mobileMemberRosterRequestSchema = z.object({ after: z.uuid().optional(), asOf: timestamp.optional() }).strict()
  .refine(value => !value.after || Boolean(value.asOf), 'A roster cursor requires its original cutoff.');
export type MobileMemberRosterRequest = z.infer<typeof mobileMemberRosterRequestSchema>;
const cursor = z.object({ after: z.uuid(), asOf: timestamp }).strict().nullable();
const uniqueMembers = (items: MobileRosterMember[]) => new Set(items.map(item => item.id)).size === items.length && new Set(items.map(item => item.profileId)).size === items.length;
export const mobileMemberRosterPageSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  items: z.array(mobileRosterMemberSchema).max(MOBILE_MEMBER_ROSTER_PAGE_SIZE), asOf: timestamp, fetchedAt: timestamp, nextCursor: cursor }).strict()
  .refine(value => uniqueMembers(value.items), 'Duplicate roster member or profile IDs.');
export type MobileMemberRosterPage = z.infer<typeof mobileMemberRosterPageSchema>;
export const mobileMemberRosterCacheSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  items: z.array(mobileRosterMemberSchema).max(MOBILE_MEMBER_ROSTER_CACHE_LIMIT), fetchedAt: timestamp }).strict()
  .refine(value => uniqueMembers(value.items), 'Duplicate roster member or profile IDs.');
export type MobileMemberRosterCache = z.infer<typeof mobileMemberRosterCacheSchema>;
export function assertMemberRosterIdentity(identity: MobileIdentity, actual: MobileIdentity) {
  const permissions = (actor: MobileIdentity) => [...new Set(actor.permissions)].sort().join(',');
  if (!identity.permissions.includes('members.manage') || !actual.permissions.includes('members.manage')) throw new Error('Current member management permission is required.');
  if (identity.userId !== actual.userId || identity.teamId !== actual.teamId || identity.memberId !== actual.memberId || identity.role !== actual.role
    || permissions(identity) !== permissions(actual)) throw new Error('Reopen the matching account, team and current roster permissions.');
}
export function assertMobileMemberRosterCache(identity: MobileIdentity, value: unknown): MobileMemberRosterCache {
  const cache = mobileMemberRosterCacheSchema.parse(value); assertMemberRosterIdentity(identity, cache.identity); return cache;
}
export function assertMobileMemberRosterPage(identity: MobileIdentity, input: MobileMemberRosterRequest, value: unknown): MobileMemberRosterPage {
  input = mobileMemberRosterRequestSchema.parse(input); const page = mobileMemberRosterPageSchema.parse(value); assertMemberRosterIdentity(identity, page.identity);
  if (input.asOf && input.asOf !== page.asOf || page.items.some((item, index) => Date.parse(item.createdAt) > Date.parse(page.asOf)
    || input.after && item.id <= input.after || index > 0 && item.id <= page.items[index - 1].id)
    || page.nextCursor && (!page.items.length || page.nextCursor.after !== page.items.at(-1)?.id || page.nextCursor.asOf !== page.asOf)) throw new Error('The roster cutoff, cursor or ordering changed. Retry the download.');
  return page;
}
