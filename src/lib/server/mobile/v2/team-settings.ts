import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamSettingsIdentity, assertMobileTeamSettings, mobilePersistedTeamSettingsSchema, mobileSettingsCustomRoleSchema,
  MOBILE_TEAM_SETTINGS_PAGE_SIZE, MOBILE_TEAM_SETTINGS_ROLE_LIMIT } from '@/lib/mobile/v2/team-settings';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
const settingsRow = z.object({ team_id: z.uuid(), default_service_location: z.string(), default_call_time: z.string(), default_rehearsal_time: z.string(),
  notification_preferences: z.array(z.string()), dashboard_widgets: z.array(z.string()), updated_at: z.string() }).strict();
const roleRow = z.object({ id: z.uuid(), team_id: z.uuid(), name: z.string(), permissions: z.array(z.string()), created_at: z.string().nullable() }).strict();
function unavailable() { return new MobileApiError(503, 'team_settings', 'The complete settings and role catalog could not be verified. Previous saved data is retained.'); }
const allowed = (identity: MobileIdentity) => identity.permissions.includes('members.manage') || identity.permissions.includes('team.manage');
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  if (!allowed(context.identity)) throw new MobileApiError(403, 'settings_permission', 'Current member-management or team-management permission is required.');
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  if (!allowed({ userId: context.identity.userId, ...current })) throw new MobileApiError(403, 'settings_permission', 'Current member-management or team-management permission is required.');
  try { assertTeamSettingsIdentity(context.identity, { userId: context.identity.userId, ...current }); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current settings permissions.'); }
}
export async function readMobileTeamSettings(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); context = { ...context, identity }; await verify(context);
  const fetchedAt = new Date().toISOString();
  let settingsQuery = context.client.from('team_settings').select('team_id,default_service_location,default_call_time,default_rehearsal_time,notification_preferences,dashboard_widgets,updated_at').eq('team_id', identity.teamId);
  if (context.signal) settingsQuery = settingsQuery.abortSignal(context.signal);
  const settingsResult = await settingsQuery.maybeSingle(); context.signal?.throwIfAborted();
  let settings: z.infer<typeof mobilePersistedTeamSettingsSchema> | null = null;
  if (settingsResult.error) throw unavailable();
  if (settingsResult.data !== null) {
    const row = settingsRow.safeParse(settingsResult.data); if (!row.success || row.data.team_id !== identity.teamId) throw unavailable();
    const parsed = mobilePersistedTeamSettingsSchema.safeParse({ defaultServiceLocation: row.data.default_service_location, defaultCallTime: row.data.default_call_time,
      defaultRehearsalTime: row.data.default_rehearsal_time, notificationPreferences: row.data.notification_preferences, dashboardWidgets: row.data.dashboard_widgets, updatedAt: row.data.updated_at });
    if (!parsed.success) throw unavailable(); settings = parsed.data;
  }
  const customRoles: z.infer<typeof mobileSettingsCustomRoleSchema>[] = []; let after: string | undefined;
  for (;;) {
    context.signal?.throwIfAborted();
    let query = context.client.from('custom_roles').select('id,team_id,name,permissions,created_at').eq('team_id', identity.teamId)
      .order('id', { ascending: true }).limit(Math.min(MOBILE_TEAM_SETTINGS_PAGE_SIZE, MOBILE_TEAM_SETTINGS_ROLE_LIMIT - customRoles.length + 1));
    if (after) query = query.gt('id', after);
    const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
    const rows = z.array(roleRow).max(MOBILE_TEAM_SETTINGS_PAGE_SIZE).safeParse(response.data);
    if (response.error || !rows.success) throw unavailable();
    if (!rows.data.length) break;
    for (const row of rows.data) {
      const parsed = mobileSettingsCustomRoleSchema.safeParse({ id: row.id, teamId: row.team_id, name: row.name, permissions: row.permissions, createdAt: row.created_at });
      if (!parsed.success || row.team_id !== identity.teamId || after && row.id <= after) throw unavailable();
      customRoles.push(parsed.data); after = row.id;
      if (customRoles.length > MOBILE_TEAM_SETTINGS_ROLE_LIMIT) throw new MobileApiError(503, 'settings_catalog_limit', 'This team has more than1000 custom roles. Its complete catalog cannot be downloaded; previous saved data is retained.');
    }
    // Short PostgREST-capped pages are not proof of exhaustion. Fetch until empty.
  }
  await verify(context);
  try { return assertMobileTeamSettings(identity, { version: 2, identity, settings, customRoles, fetchedAt }); } catch { throw unavailable(); }
}
