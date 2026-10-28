import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

const count = z.number().int().min(0).max(1000);
const attendance = z.object({ status: z.enum(['complete', 'partial', 'unavailable']), availableCount: count.nullable(), responseCount: count.nullable(),
  rate: z.number().int().min(0).max(100).nullable(), throughDate: z.iso.date(), reason: z.string().max(300).nullable(),
}).strict().superRefine((value, context) => {
  const expected = value.responseCount ? Math.round((value.availableCount ?? 0) / value.responseCount * 100) : null;
  if (value.availableCount !== null && value.responseCount !== null && value.availableCount > value.responseCount
    || value.status === 'complete' && (value.availableCount === null || value.responseCount === null || value.rate !== expected)
    || value.status !== 'complete' && value.rate !== null
    || value.status === 'unavailable' && (value.availableCount !== null || value.responseCount !== null)) context.addIssue({ code: 'custom', message: 'Unverified attendance summary.' });
});
export const mobileProfileSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema,
  profile: z.object({ id: z.uuid(), fullName: z.string().max(160).nullable(), email: z.string().max(254).nullable(), avatarUrl: z.null(), birthday: z.iso.date().nullable() }).strict(),
  membership: z.object({ id: z.uuid(), teamId: z.uuid(), userId: z.uuid(), role: z.enum(teamRoles), ministries: z.array(z.string().max(160)).max(100),
    createdAt: z.iso.datetime({ offset: true }), teamAnniversary: z.iso.date().nullable(), status: z.literal('active') }).strict(),
  stats: z.object({ attendance }).strict(), fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.profile.id === value.identity.userId && value.membership.userId === value.identity.userId
  && value.membership.teamId === value.identity.teamId && value.membership.id === value.identity.memberId && value.membership.role === value.identity.role, 'Profile membership scope mismatch.');
export type MobileProfile = z.infer<typeof mobileProfileSchema>;
export function assertMobileProfile(identity: MobileIdentity, value: unknown): MobileProfile {
  const parsed = mobileProfileSchema.parse(value); const permissions = (actor: MobileIdentity) => [...new Set(actor.permissions)].sort().join(',');
  if (identity.userId !== parsed.identity.userId || identity.teamId !== parsed.identity.teamId || identity.memberId !== parsed.identity.memberId
    || identity.role !== parsed.identity.role || permissions(identity) !== permissions(parsed.identity)) throw new Error('Reopen the matching account and current profile membership.');
  return parsed;
}
