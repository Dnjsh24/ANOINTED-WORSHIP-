import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertAnalyticsIdentity, assertMobileAnalytics, mobileAnalyticsRequestSchema, type MobileAnalyticsRequest } from '@/lib/mobile/v2/analytics';
import { parseAnalyticsRange } from '@/lib/domain/analytics';
import { loadAnalytics } from '@/lib/server/mobile/analytics-source';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; input: MobileAnalyticsRequest; signal?: AbortSignal; now?: Date };
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId });
  context.signal?.throwIfAborted();
  if (![context.identity.role, current.role].every(role => role === 'owner' || role === 'admin')) throw new MobileApiError(403, 'analytics_permission', 'An active owner or admin membership is required to read team analytics.');
  try { assertAnalyticsIdentity(context.identity, { userId: context.identity.userId, ...current }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current analytics authority.'); }
}
export async function readMobileAnalytics(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileAnalyticsRequestSchema.parse(context.input);
  context = { ...context, identity, input }; await verify(context);
  const now = context.now ?? new Date(); const range = parseAnalyticsRange(input, now);
  const analytics = await loadAnalytics(identity.teamId, range, now, { client: context.client, signal: context.signal });
  await verify(context);
  try { return assertMobileAnalytics(identity, input, { version: 2, identity, analytics, fetchedAt: now.toISOString() }); }
  catch { throw new MobileApiError(503, 'analytics_unavailable', 'The analytics response could not be verified. Previous saved data is retained.'); }
}
