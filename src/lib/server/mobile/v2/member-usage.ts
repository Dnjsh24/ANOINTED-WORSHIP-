import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertAnalyticsIdentity } from '@/lib/mobile/v2/analytics';
import { assertMobileMemberUsage, mobileMemberUsageRequestSchema, MOBILE_MEMBER_USAGE_NAME_LIMIT, type MobileMemberUsageRequest } from '@/lib/mobile/v2/member-usage';
import { loadMemberUsageDays } from '@/lib/server/mobile/member-usage-source';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; input: MobileMemberUsageRequest; signal?: AbortSignal };
const profile = z.object({ id: z.uuid(), full_name: z.string().max(160).nullable() }).strict();
const member = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), profiles: z.union([profile, z.array(profile).length(1)]) }).strict();
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId });
  context.signal?.throwIfAborted();
  if (![context.identity.role, current.role].every(role => role === 'owner' || role === 'admin')) throw new MobileApiError(403, 'usage_permission', 'An active owner or admin membership is required to read member app usage.');
  try { assertAnalyticsIdentity(context.identity, { userId: context.identity.userId, ...current }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current usage authority.'); }
}
async function readNames(context: Context) {
  const names: Record<string, string> = {}; const ids = new Set<string>(); const profileIds = new Set<string>(); let cursor: string | null = null;
  while (true) {
    context.signal?.throwIfAborted();
    let query = context.client.from('team_members').select('id,team_id,profile_id,profiles(id,full_name)').eq('team_id', context.identity.teamId).order('id').limit(500);
    if (cursor) query = query.gt('id', cursor);
    const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
    const rows = z.array(member).max(500).safeParse(response.data);
    if (response.error || !rows.success || ids.size + rows.data.length > MOBILE_MEMBER_USAGE_NAME_LIMIT) throw new Error('Member names could not be completely verified.');
    if (!rows.data.length) return { names, ids };
    for (const row of rows.data) {
      const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (row.team_id !== context.identity.teamId || person.id !== row.profile_id || cursor && row.id <= cursor || profileIds.has(row.profile_id)) throw new Error('Member names have an invalid relationship or ordering.');
      ids.add(row.id); profileIds.add(row.profile_id); cursor = row.id;
      if (person.full_name?.trim()) names[row.id] = person.full_name.trim();
    }
  }
}
export async function readMobileMemberUsage(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileMemberUsageRequestSchema.parse(context.input);
  context = { ...context, identity, input }; await verify(context);
  const common = { version: 2 as const, identity, ...input, fetchedAt: new Date().toISOString() };
  let result: unknown;
  try {
    const usage = await loadMemberUsageDays(context.client, identity.teamId, input.start, input.end, { signal: context.signal });
    if (usage.kind === 'unavailable') result = { ...common, ...usage };
    else {
      const members = await readNames(context);
      if (usage.rows.some(row => !members.ids.has(row.member_id))) throw new Error('Usage has an unverified team member.');
      result = { ...common, kind: 'ready', rows: usage.rows, memberNames: members.names };
      // Invalid or partial results become explicit unavailability; no rows are silently removed.
      assertMobileMemberUsage(identity, input, result);
    }
  } catch {
    context.signal?.throwIfAborted();
    result = { ...common, kind: 'unavailable', message: 'Complete member app usage could not be verified. Previous saved data is retained. Please retry.' };
  }
  await verify(context);
  return assertMobileMemberUsage(identity, input, result);
}
