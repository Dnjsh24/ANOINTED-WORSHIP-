import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_MEMBER_REQUESTS_PAGE_SIZE = 100;
export const MOBILE_MEMBER_REQUESTS_CACHE_LIMIT = 5000;
const timestamp = z.iso.datetime({ offset: true });
export const mobilePendingMemberRequestSchema = z.object({ id: z.uuid(), profileId: z.uuid(), fullName: z.string().max(160).nullable(), email: z.string().max(254).nullable(), avatarUrl: z.null(),
  requestedRole: z.enum(teamRoles), status: z.literal('pending'), requestedAt: timestamp }).strict();
export type MobilePendingMemberRequest = z.infer<typeof mobilePendingMemberRequestSchema>;
export const mobileMemberRequestsRequestSchema = z.object({ after: z.uuid().optional(), asOf: timestamp.optional() }).strict()
  .refine(value => !value.after || Boolean(value.asOf), 'A pending requests cursor requires its original cutoff.');
export type MobileMemberRequestsRequest = z.infer<typeof mobileMemberRequestsRequestSchema>;
const cursor = z.object({ after: z.uuid(), asOf: timestamp }).strict().nullable();
const uniqueMembers = (items: MobilePendingMemberRequest[]) => new Set(items.map(item => item.id)).size === items.length && new Set(items.map(item => item.profileId)).size === items.length;
export const mobileMemberRequestsPageSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  items: z.array(mobilePendingMemberRequestSchema).max(MOBILE_MEMBER_REQUESTS_PAGE_SIZE), asOf: timestamp, fetchedAt: timestamp, nextCursor: cursor }).strict()
  .refine(value => uniqueMembers(value.items), 'Duplicate pending requests member or profile IDs.');
export type MobileMemberRequestsPage = z.infer<typeof mobileMemberRequestsPageSchema>;
export const mobileMemberRequestsCacheSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  items: z.array(mobilePendingMemberRequestSchema).max(MOBILE_MEMBER_REQUESTS_CACHE_LIMIT), fetchedAt: timestamp }).strict()
  .refine(value => uniqueMembers(value.items), 'Duplicate pending requests member or profile IDs.');
export type MobileMemberRequestsCache = z.infer<typeof mobileMemberRequestsCacheSchema>;
export function assertMemberRequestsIdentity(identity: MobileIdentity, actual: MobileIdentity) {
  const permissions = (actor: MobileIdentity) => [...new Set(actor.permissions)].sort().join(',');
  if (!identity.permissions.includes('members.manage') || !actual.permissions.includes('members.manage')) throw new Error('Current member management permission is required.');
  if (identity.userId !== actual.userId || identity.teamId !== actual.teamId || identity.memberId !== actual.memberId || identity.role !== actual.role
    || permissions(identity) !== permissions(actual)) throw new Error('Reopen the matching account, team and current pending requests permissions.');
}
export function assertMobileMemberRequestsCache(identity: MobileIdentity, value: unknown): MobileMemberRequestsCache {
  const cache = mobileMemberRequestsCacheSchema.parse(value); assertMemberRequestsIdentity(identity, cache.identity); return cache;
}
export function assertMobileMemberRequestsPage(identity: MobileIdentity, input: MobileMemberRequestsRequest, value: unknown): MobileMemberRequestsPage {
  input = mobileMemberRequestsRequestSchema.parse(input); const page = mobileMemberRequestsPageSchema.parse(value); assertMemberRequestsIdentity(identity, page.identity);
  if (input.asOf && input.asOf !== page.asOf || page.items.some((item, index) => Date.parse(item.requestedAt) > Date.parse(page.asOf)
    || input.after && item.id <= input.after || index > 0 && item.id <= page.items[index - 1].id)
    || page.nextCursor && (!page.items.length || page.nextCursor.after !== page.items.at(-1)?.id || page.nextCursor.asOf !== page.asOf)) throw new Error('The pending requests cutoff, cursor or ordering changed. Retry the download.');
  return page;
}
