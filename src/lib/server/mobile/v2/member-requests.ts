import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertMemberRequestsIdentity, assertMobileMemberRequestsPage, mobileMemberRequestsRequestSchema, mobilePendingMemberRequestSchema,
  MOBILE_MEMBER_REQUESTS_PAGE_SIZE, type MobileMemberRequestsRequest } from '@/lib/mobile/v2/member-requests';
import { teamRoles } from '@/lib/types';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; input: MobileMemberRequestsRequest; signal?: AbortSignal };
const profile = z.object({ id: z.uuid(), full_name: z.string().max(160).nullable(), email: z.string().max(254).nullable() }).strict();
const rowSchema = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), requested_role: z.enum(teamRoles), status: z.literal('pending'),
  created_at: z.iso.datetime({ offset: true }), profiles: z.union([profile, z.array(profile).length(1)]) }).strict();
function unavailable() { return new MobileApiError(503, 'member_requests', 'The complete pending requests page could not be verified. Previous saved data is retained.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  if (!context.identity.permissions.includes('members.manage') || !current.permissions.includes('members.manage')) throw new MobileApiError(403, 'member_requests_permission', 'Current member management permission is required to read pending requests.');
  try { assertMemberRequestsIdentity(context.identity, { userId: context.identity.userId, ...current }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current pending requests permissions.'); }
}
export async function readMobileMemberRequests(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileMemberRequestsRequestSchema.parse(context.input);
  context = { ...context, identity, input }; await verify(context);
  const fetchedAt = new Date().toISOString(); const asOf = input.asOf ?? fetchedAt;
  if (Date.parse(asOf) > Date.parse(fetchedAt)) throw new MobileApiError(400, 'member_requests_cursor', 'The pending requests cutoff cannot be in the future.');
  let query = context.client.from('join_requests').select('id,team_id,profile_id,requested_role,status,created_at,profiles:profiles!join_requests_profile_id_fkey(id,full_name,email)')
    .eq('team_id', identity.teamId).eq('status', 'pending').lte('created_at', asOf).order('id', { ascending: true }).limit(MOBILE_MEMBER_REQUESTS_PAGE_SIZE);
  if (input.after) query = query.gt('id', input.after);
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  const rows = z.array(rowSchema).max(MOBILE_MEMBER_REQUESTS_PAGE_SIZE).safeParse(response.data);
  if (response.error || !rows.success || rows.data.some(row => row.team_id !== identity.teamId || (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles).id !== row.profile_id)) throw unavailable();
  const items = rows.data.map(row => {
    const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return mobilePendingMemberRequestSchema.parse({ id: row.id, profileId: row.profile_id, fullName: person.full_name, email: person.email, avatarUrl: null,
      requestedRole: row.requested_role, status: row.status, requestedAt: row.created_at });
  });
  await verify(context);
  // Continue even after short PostgREST-capped pages; only an empty page proves exhaustion.
  try { return assertMobileMemberRequestsPage(identity, input, { version: 2, identity, items, asOf, fetchedAt, nextCursor: items.length ? { after: items.at(-1)!.id, asOf } : null }); }
  catch { throw unavailable(); }
}
