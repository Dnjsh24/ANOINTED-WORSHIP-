import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertMobileProfile, type MobileProfile } from '@/lib/mobile/v2/profile';
import { MobileApiError } from '../context';
import { teamRoles } from '@/lib/types';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
const profileRow = z.object({ id: z.uuid(), full_name: z.string().max(160).nullable(), email: z.string().max(254).nullable(), birthday: z.iso.date().nullable() }).strict();
const memberRow = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), role: z.enum(teamRoles), ministries: z.array(z.string().max(160)).max(100).nullable(),
  created_at: z.iso.datetime({ offset: true }), team_anniversary: z.iso.date().nullable(), status: z.literal('active') }).strict();
const event = z.object({ team_id: z.uuid(), event_date: z.iso.date() }).strict();
const attendanceRow = z.object({ id: z.uuid(), team_member_id: z.uuid(), status: z.enum(['available', 'maybe', 'unavailable', 'pending']), events: z.union([event, z.array(event).length(1)]) }).strict();
function unavailable() { return new MobileApiError(503, 'profile', 'Your profile could not be verified. The previous saved profile is retained.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const actual = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId });
  context.signal?.throwIfAborted();
  const permissions = (actor: { permissions: readonly string[] }) => [...new Set(actor.permissions)].sort().join(',');
  if (actual.memberId !== context.identity.memberId || actual.teamId !== context.identity.teamId || actual.role !== context.identity.role || permissions(actual) !== permissions(context.identity)) {
    throw new MobileApiError(409, 'scope_changed', 'Reopen the matching account and current profile membership.');
  }
}
async function attendance(context: Context, throughDate: string): Promise<MobileProfile['stats']['attendance']> {
  let availableCount = 0; let responseCount = 0; let after: string | undefined;
  try {
    while (responseCount <= 1000) {
      context.signal?.throwIfAborted();
      let query = context.client.from('attendance').select('id,team_member_id,status,events!inner(team_id,event_date)').eq('team_member_id', context.identity.memberId)
        .eq('events.team_id', context.identity.teamId).lte('events.event_date', throughDate).order('id', { ascending: true }).limit(Math.min(100, 1001 - responseCount));
      if (after) query = query.gt('id', after);
      const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
      const rows = z.array(attendanceRow).max(Math.min(100, 1001 - responseCount)).safeParse(result.data);
      if (result.error || !rows.success || rows.data.some((row, index) => row.team_member_id !== context.identity.memberId || (after && row.id <= after)
        || index > 0 && row.id <= rows.data[index - 1].id || (Array.isArray(row.events) ? row.events[0] : row.events).team_id !== context.identity.teamId
        || (Array.isArray(row.events) ? row.events[0] : row.events).event_date > throughDate)) throw unavailable();
      if (!rows.data.length) return { status: 'complete', availableCount, responseCount, rate: responseCount ? Math.round(availableCount / responseCount * 100) : null, throughDate, reason: null };
      for (const row of rows.data) {
        if (responseCount === 1000) return { status: 'partial', availableCount, responseCount, rate: null, throughDate, reason: 'More than 1,000 past attendance responses exist. The rate is not calculated from a partial history.' };
        responseCount++; if (row.status === 'available') availableCount++;
      }
      after = rows.data.at(-1)!.id;
    }
  } catch { context.signal?.throwIfAborted(); }
  return { status: 'unavailable', availableCount: null, responseCount: null, rate: null, throughDate, reason: 'Past attendance could not be fully verified.' };
}
export async function readMobileProfile(context: Context): Promise<MobileProfile> {
  const identity = mobileIdentitySchema.parse(context.identity); await verify(context);
  const profileQuery = context.client.from('profiles').select('id,full_name,email,birthday').eq('id', identity.userId);
  const memberQuery = context.client.from('team_members').select('id,team_id,profile_id,role,ministries,created_at,team_anniversary,status')
    .eq('id', identity.memberId).eq('team_id', identity.teamId).eq('profile_id', identity.userId).eq('status', 'active');
  const [profileResult, memberResult] = await Promise.all([
    (context.signal ? profileQuery.abortSignal(context.signal) : profileQuery).maybeSingle(),
    (context.signal ? memberQuery.abortSignal(context.signal) : memberQuery).maybeSingle(),
  ]); context.signal?.throwIfAborted();
  const profile = profileRow.safeParse(profileResult.data); const member = memberRow.safeParse(memberResult.data);
  if (profileResult.error || memberResult.error || !profile.success || !member.success || profile.data.id !== identity.userId || member.data.id !== identity.memberId
    || member.data.team_id !== identity.teamId || member.data.profile_id !== identity.userId || member.data.role !== identity.role) throw unavailable();
  const fetchedAt = new Date().toISOString(); const stats = await attendance(context, fetchedAt.slice(0, 10)); await verify(context);
  return assertMobileProfile(identity, { version: 2, identity, profile: { id: profile.data.id, fullName: profile.data.full_name, email: profile.data.email, avatarUrl: null, birthday: profile.data.birthday },
    membership: { id: member.data.id, teamId: member.data.team_id, userId: member.data.profile_id, role: member.data.role, ministries: member.data.ministries ?? [],
      createdAt: member.data.created_at, teamAnniversary: member.data.team_anniversary, status: 'active' }, stats: { attendance: stats }, fetchedAt });
}
