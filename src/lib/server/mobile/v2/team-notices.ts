import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertMobileTeamNoticesPage, assertTeamNoticesIdentity, MOBILE_TEAM_NOTICES_PAGE_SIZE, mobileTeamNoticesRequestSchema,
  mobileAnnouncementSchema, mobileReminderSchema, type MobileTeamNoticesRequest } from '@/lib/mobile/v2/team-notices';
import { MobileApiError } from '../context';
import { teamRoles } from '@/lib/types';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; input: MobileTeamNoticesRequest; signal?: AbortSignal };
const timestamp = z.iso.datetime({ offset: true });
const rawCommon = { id: z.uuid(), team_id: z.uuid(), title: z.string(), created_at: timestamp, created_by: z.uuid().nullable(), event_id: z.uuid().nullable(),
  priority: z.enum(['normal', 'important', 'urgent']), target_label: z.string(), target_role: z.enum(teamRoles).nullable(), target_profile_id: z.uuid().nullable() };
const event = z.object({ name: z.string().nullable() }).strict();
const announcementRow = z.object({ ...rawCommon, body: z.string(), category: z.string(), is_pinned: z.boolean().nullable(), events: z.union([event, z.array(event).max(1)]).nullable() }).strict();
const reminderRow = z.object({ ...rawCommon, body: z.string().nullable(), profile_id: z.uuid(), target_path: z.string().nullable(), read_at: timestamp.nullable(), acknowledged_at: timestamp.nullable(),
  scheduled_for: timestamp, recurrence_rule: z.enum(['none', 'weekly', 'monthly']), recurrence_index: z.number().int(), recurrence_total: z.number().int(), notice_group_id: z.uuid().nullable() }).strict();
function unavailable() { return new MobileApiError(503, 'team_notices', 'Team notices could not be verified. The previous saved notices are retained.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const workspace = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId });
  context.signal?.throwIfAborted();
  try { assertTeamNoticesIdentity(context.identity, { userId: context.identity.userId, ...workspace }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current notice permissions.'); }
}
export async function readMobileTeamNotices(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileTeamNoticesRequestSchema.parse(context.input);
  const now = new Date().toISOString(); const asOf = input.asOf ?? now;
  if (Date.parse(asOf) > Date.parse(now)) throw new MobileApiError(400, 'validation', 'The notice cutoff cannot be in the future.');
  await verify(context);
  let items;
  if (input.kind === 'announcements') {
    let query = context.client.from('announcements').select('id,team_id,title,body,category,target_label,target_role,target_profile_id,priority,event_id,created_at,created_by,is_pinned,events(name)')
      .eq('team_id', identity.teamId).lte('created_at', asOf).order('id', { ascending: true }).limit(MOBILE_TEAM_NOTICES_PAGE_SIZE);
    if (input.after) query = query.gt('id', input.after);
    const response = await (context.signal ? query.abortSignal(context.signal) : query);
    context.signal?.throwIfAborted();
    const rows = z.array(announcementRow).max(MOBILE_TEAM_NOTICES_PAGE_SIZE).safeParse(response.data);
    if (response.error || !rows.success || rows.data.some(row => row.team_id !== identity.teamId || Date.parse(row.created_at) > Date.parse(asOf)
      || !(row.target_role === null && row.target_profile_id === null || row.target_profile_id === identity.userId || row.target_role === identity.role || ['owner', 'admin'].includes(identity.role)))) throw unavailable();
    const ids = rows.data.map(row => row.id); let acknowledged = new Set<string>();
    if (ids.length) {
      const receiptQuery = context.client.from('announcement_receipts').select('announcement_id,profile_id,acknowledged_at').in('announcement_id', ids).eq('profile_id', identity.userId).limit(MOBILE_TEAM_NOTICES_PAGE_SIZE);
      const result = await (context.signal ? receiptQuery.abortSignal(context.signal) : receiptQuery);
      const receipts = z.array(z.object({ announcement_id: z.uuid(), profile_id: z.uuid(), acknowledged_at: timestamp.nullable() }).strict()).max(MOBILE_TEAM_NOTICES_PAGE_SIZE).safeParse(result.data);
      if (result.error || !receipts.success || receipts.data.some(row => row.profile_id !== identity.userId || !ids.includes(row.announcement_id))
        || new Set(receipts.data.map(row => row.announcement_id)).size !== receipts.data.length) throw unavailable();
      acknowledged = new Set(receipts.data.filter(row => row.acknowledged_at).map(row => row.announcement_id));
    }
    items = rows.data.map(row => mobileAnnouncementSchema.parse({ id: row.id, title: row.title, body: row.body, category: row.category, targetLabel: row.target_label,
      targetRole: row.target_role, targetProfileId: row.target_profile_id, priority: row.priority, isPinned: row.is_pinned ?? false, eventId: row.event_id,
      eventName: (Array.isArray(row.events) ? row.events[0] : row.events)?.name ?? null, createdAt: row.created_at, createdBy: row.created_by, acknowledgedByMe: acknowledged.has(row.id) }));
  } else {
    let query = context.client.from('notifications').select('id,team_id,profile_id,title,body,target_path,target_label,target_role,target_profile_id,read_at,acknowledged_at,created_at,created_by,priority,event_id,scheduled_for,recurrence_rule,recurrence_index,recurrence_total,notice_group_id')
      .eq('team_id', identity.teamId).eq('profile_id', identity.userId).lte('scheduled_for', asOf).lte('created_at', asOf).order('id', { ascending: true }).limit(MOBILE_TEAM_NOTICES_PAGE_SIZE);
    if (input.after) query = query.gt('id', input.after);
    const response = await (context.signal ? query.abortSignal(context.signal) : query);
    context.signal?.throwIfAborted();
    const rows = z.array(reminderRow).max(MOBILE_TEAM_NOTICES_PAGE_SIZE).safeParse(response.data);
    if (response.error || !rows.success || rows.data.some(row => row.team_id !== identity.teamId || row.profile_id !== identity.userId
      || Date.parse(row.scheduled_for) > Date.parse(asOf) || Date.parse(row.created_at) > Date.parse(asOf))) throw unavailable();
    items = rows.data.map(row => mobileReminderSchema.parse({ id: row.id, title: row.title, body: row.body, targetPath: row.target_path, targetLabel: row.target_label,
      targetRole: row.target_role, targetProfileId: row.target_profile_id, priority: row.priority, eventId: row.event_id, createdAt: row.created_at, createdBy: row.created_by,
      readAt: row.read_at, acknowledgedAt: row.acknowledged_at, scheduledFor: row.scheduled_for, recurrenceRule: row.recurrence_rule,
      recurrenceIndex: row.recurrence_index, recurrenceTotal: row.recurrence_total, noticeGroupId: row.notice_group_id }));
  }
  await verify(context);
  // Even a short PostgREST page may be server-capped. Only an empty page proves
  // exhaustion; the final follow-up page never silently hides remaining notices.
  try { return assertMobileTeamNoticesPage(identity, input, { version: 2, identity, kind: input.kind, items, asOf, fetchedAt: new Date().toISOString(), nextCursor: items.length ? { after: items.at(-1)!.id, asOf } : null }); }
  catch { throw unavailable(); }
}
