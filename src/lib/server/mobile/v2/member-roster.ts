import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertMemberRosterIdentity, assertMobileMemberRosterPage, mobileMemberRosterRequestSchema, mobileRosterMemberSchema,
  MOBILE_MEMBER_ROSTER_PAGE_SIZE, type MobileMemberRosterRequest } from '@/lib/mobile/v2/member-roster';
import { teamRoles } from '@/lib/types';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; input: MobileMemberRosterRequest; signal?: AbortSignal };
const profile = z.object({ id: z.uuid(), full_name: z.string().max(160).nullable(), email: z.string().max(254).nullable() }).strict();
const rowSchema = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), role: z.enum(teamRoles), status: z.enum(['active', 'inactive']), ministry: z.string().max(160).nullable(),
  ministries: z.array(z.string().max(160)).max(100).nullable(), created_at: z.iso.datetime({ offset: true }), profiles: z.union([profile, z.array(profile).length(1)]) }).strict();
function unavailable() { return new MobileApiError(503, 'member_roster', 'The complete roster page could not be verified. Previous saved data is retained.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  if (!context.identity.permissions.includes('members.manage') || !current.permissions.includes('members.manage')) throw new MobileApiError(403, 'roster_permission', 'Current member management permission is required to read this roster.');
  try { assertMemberRosterIdentity(context.identity, { userId: context.identity.userId, ...current }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current roster permissions.'); }
}
export async function readMobileMemberRoster(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileMemberRosterRequestSchema.parse(context.input);
  context = { ...context, identity, input }; await verify(context);
  const fetchedAt = new Date().toISOString(); const asOf = input.asOf ?? fetchedAt;
  if (Date.parse(asOf) > Date.parse(fetchedAt)) throw new MobileApiError(400, 'roster_cursor', 'The roster cutoff cannot be in the future.');
  let query = context.client.from('team_members').select('id,team_id,profile_id,role,status,ministry,ministries,created_at,profiles(id,full_name,email)')
    .eq('team_id', identity.teamId).lte('created_at', asOf).order('id', { ascending: true }).limit(MOBILE_MEMBER_ROSTER_PAGE_SIZE);
  if (input.after) query = query.gt('id', input.after);
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  const rows = z.array(rowSchema).max(MOBILE_MEMBER_ROSTER_PAGE_SIZE).safeParse(response.data);
  if (response.error || !rows.success || rows.data.some(row => row.team_id !== identity.teamId || (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles).id !== row.profile_id)) throw unavailable();
  const items = rows.data.map(row => {
    const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return mobileRosterMemberSchema.parse({ id: row.id, profileId: row.profile_id, fullName: person.full_name, email: person.email, avatarUrl: null, role: row.role,
      status: row.status, ministry: row.ministry, ministries: row.ministries ?? (row.ministry ? [row.ministry] : []), createdAt: row.created_at });
  });
  await verify(context);
  // Continue even after short PostgREST-capped pages; only an empty page proves exhaustion.
  try { return assertMobileMemberRosterPage(identity, input, { version: 2, identity, items, asOf, fetchedAt, nextCursor: items.length ? { after: items.at(-1)!.id, asOf } : null }); }
  catch { throw unavailable(); }
}
