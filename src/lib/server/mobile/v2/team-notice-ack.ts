import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertTeamNoticeAckReceipt, teamNoticeAckRequestSchema, type TeamNoticeAckRequest } from '@/lib/mobile/v2/team-notice-ack';
import { teamRoles } from '@/lib/types';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: TeamNoticeAckRequest; signal?: AbortSignal };
const timestamp = z.iso.datetime({ offset: true });
const receiptRow = z.object({ announcement_id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), read_at: timestamp.nullable(), acknowledged_at: timestamp.nullable() }).strict();
const reminderRow = z.object({ id: z.uuid(), team_id: z.uuid(), profile_id: z.uuid(), read_at: timestamp.nullable(), acknowledged_at: timestamp.nullable(), scheduled_for: timestamp }).strict();
const announcementRow = z.object({ id: z.uuid(), team_id: z.uuid(), target_role: z.enum(teamRoles).nullable(), target_profile_id: z.uuid().nullable() }).strict();
function denied() { return new MobileApiError(403, 'notice_unavailable', 'Current access to your own notice is required. Keep the acknowledgement intent until confirmed.'); }
function unknown() { return new MobileApiError(503, 'notice_ack_unknown', 'The acknowledgement could not be confirmed. Retry the same saved intent.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const workspace = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  try { assertTeamNoticesIdentity(context.identity, { userId: context.identity.userId, ...workspace }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching account and team before acknowledging notices.'); }
}
async function target(context: Context) {
  const { identity, request } = context; context.signal?.throwIfAborted();
  if (request.kind === 'announcement') {
    const query = context.client.from('announcements').select('id,team_id,target_role,target_profile_id').eq('id', request.targetId).eq('team_id', identity.teamId);
    const response = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle();
    const row = announcementRow.safeParse(response.data);
    if (response.error) throw unknown();
    if (!row.success || row.data.id !== request.targetId || row.data.team_id !== identity.teamId || !(row.data.target_role === null && row.data.target_profile_id === null
      || row.data.target_profile_id === identity.userId || row.data.target_role === identity.role || ['owner', 'admin'].includes(identity.role))) throw denied();
    return null;
  }
  const query = context.client.from('notifications').select('id,team_id,profile_id,read_at,acknowledged_at,scheduled_for')
    .eq('id', request.targetId).eq('team_id', identity.teamId).eq('profile_id', identity.userId);
  const response = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); const row = reminderRow.safeParse(response.data);
  if (response.error) throw unknown();
  if (!row.success || row.data.id !== request.targetId || row.data.team_id !== identity.teamId || row.data.profile_id !== identity.userId || Date.parse(row.data.scheduled_for) > Date.now()) throw denied();
  return row.data;
}
async function readAnnouncementReceipt(context: Context) {
  const query = context.client.from('announcement_receipts').select('announcement_id,team_id,profile_id,read_at,acknowledged_at')
    .eq('announcement_id', context.request.targetId).eq('team_id', context.identity.teamId).eq('profile_id', context.identity.userId);
  const response = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle();
  if (response.error) throw unknown(); if (response.data === null) return null;
  const row = receiptRow.safeParse(response.data);
  if (!row.success || row.data.announcement_id !== context.request.targetId || row.data.team_id !== context.identity.teamId || row.data.profile_id !== context.identity.userId) throw unknown();
  return row.data;
}
export async function acknowledgeMobileTeamNotice(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = teamNoticeAckRequestSchema.parse(context.request);
  context = { ...context, identity, request }; await verify(context); const current = await target(context); context.signal?.throwIfAborted();
  const now = new Date().toISOString();
  if (request.kind === 'announcement') {
    let own = await readAnnouncementReceipt(context);
    if (!own) {
      // Concurrent first acknowledgements never overwrite the winner's timestamp.
      const query = context.client.from('announcement_receipts').upsert({ announcement_id: request.targetId, team_id: identity.teamId, profile_id: identity.userId, read_at: now, acknowledged_at: now },
        { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true });
      const result = await (context.signal ? query.abortSignal(context.signal) : query); if (result.error) throw unknown();
      own = await readAnnouncementReceipt(context);
    }
    if (own && !own.acknowledged_at) {
      const query = context.client.from('announcement_receipts').update({ read_at: own.read_at ?? now, acknowledged_at: now }).eq('announcement_id', request.targetId)
        .eq('team_id', identity.teamId).eq('profile_id', identity.userId).is('acknowledged_at', null);
      const result = await (context.signal ? query.abortSignal(context.signal) : query); if (result.error) throw unknown();
    }
  } else if (current && !current.acknowledged_at) {
    const query = context.client.from('notifications').update({ read_at: current.read_at ?? now, acknowledged_at: now }).eq('id', request.targetId)
      .eq('team_id', identity.teamId).eq('profile_id', identity.userId).is('acknowledged_at', null).lte('scheduled_for', now);
    const result = await (context.signal ? query.abortSignal(context.signal) : query); if (result.error) throw unknown();
  }
  context.signal?.throwIfAborted(); await verify(context);
  const latest = await target(context);
  const persisted = request.kind === 'announcement' ? await readAnnouncementReceipt(context) : latest;
  context.signal?.throwIfAborted(); if (!persisted?.acknowledged_at) throw unknown();
  return assertTeamNoticeAckReceipt(identity, request, { ...request, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, acknowledgedAt: persisted.acknowledged_at });
}
