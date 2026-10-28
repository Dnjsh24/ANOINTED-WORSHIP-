// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { teamSettingsIdentity as identity, teamSettingsResponse as expected, teamSettingsId as id } from '@/lib/mobile/v2/team-settings-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileTeamSettings } from './team-settings';

const settings = { team_id: identity.teamId, default_service_location: 'North chapel', default_call_time: '07:30:00', default_rehearsal_time: '07:45:00',
  notification_preferences: ['upcomingEvents'], dashboard_widgets: ['setlists', 'events'], updated_at: '2026-10-22T00:00:00Z' };
const role = (n = 10) => ({ id: id(n), team_id: identity.teamId, name: 'Coordinator', permissions: ['setlists.manage'], created_at: null });
type Options = { settings?: unknown; settingsError?: boolean; pages?: { data: unknown; error?: boolean }[]; onResponse?: (table: string, index: number) => void };
function setup(options: Options = {}) {
  const calls: unknown[][] = []; let pageIndex = 0;
  const from = vi.fn((table: string) => {
    const index = table === 'custom_roles' ? pageIndex++ : -1;
    const page = options.pages?.[index] ?? { data: index === 0 ? [role()] : [] };
    const response = table === 'team_settings' ? { data: options.settings === undefined ? settings : options.settings, error: options.settingsError ? { code: 'XX000' } : null }
      : { data: page.data, error: page.error ? { code: 'XX000' } : null };
    const execute = () => { options.onResponse?.(table, index); return response; };
    const query = { select: (...args: unknown[]) => { calls.push([table, 'select', ...args]); return query; }, eq: (...args: unknown[]) => { calls.push([table, 'eq', ...args]); return query; },
      order: (...args: unknown[]) => { calls.push([table, 'order', ...args]); return query; }, gt: (...args: unknown[]) => { calls.push([table, 'gt', ...args]); return query; },
      limit: (...args: unknown[]) => { calls.push([table, 'limit', ...args]); return query; }, abortSignal: (...args: unknown[]) => { calls.push([table, 'abortSignal', ...args]); return query; },
      maybeSingle: () => Promise.resolve(execute()), then: <T>(resolve: (value: typeof response) => T) => Promise.resolve(execute()).then(resolve) };
    return query;
  });
  return { calls, from, client: { from } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(expected.fetchedAt); mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
afterEach(() => vi.useRealTimers());
it('reads only selected-team persisted fields and verifies current authority before and after the complete read', async () => {
  const { client, calls, from } = setup();
  expect(await readMobileTeamSettings({ client, identity })).toEqual({ ...expected, fetchedAt: new Date(expected.fetchedAt).toISOString() });
  expect(calls).toEqual(expect.arrayContaining([['team_settings', 'eq', 'team_id', identity.teamId], ['custom_roles', 'eq', 'team_id', identity.teamId],
    ['custom_roles', 'order', 'id', { ascending: true }], ['custom_roles', 'limit', 100], ['custom_roles', 'gt', 'id', id(10)]]));
  expect(from.mock.calls.map(call => call[0])).toEqual(['team_settings', 'custom_roles', 'custom_roles']); expect(mocks.selected).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(calls)).not.toMatch(/team_code|activity|team_members|profiles|description/);
});
it('returns missing settings and an empty catalog honestly without inserting defaults', async () => {
  const result = await readMobileTeamSettings({ ...setup({ settings: null, pages: [{ data: [] }] }), identity });
  expect(result.settings).toBeNull(); expect(result.customRoles).toEqual([]);
});
it('continues short capped pages until an empty page proves exhaustion', async () => {
  const { client, calls } = setup({ pages: [{ data: [role(10)] }, { data: [role(11)] }, { data: [] }] });
  expect((await readMobileTeamSettings({ client, identity })).customRoles.map(row => row.id)).toEqual([id(10), id(11)]);
  expect(calls).toEqual(expect.arrayContaining([['custom_roles', 'gt', 'id', id(10)], ['custom_roles', 'gt', 'id', id(11)]]));
});
it('allows exactly1000 catalog roles only after an extra empty probe and rejects1001 without partial success', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => role(index + 10));
  const pages = Array.from({ length: 10 }, (_, index) => ({ data: rows.slice(index * 100, index * 100 + 100) }));
  const { client, calls } = setup({ pages: [...pages, { data: [] }] });
  expect((await readMobileTeamSettings({ client, identity })).customRoles).toHaveLength(1000);
  expect(calls).toContainEqual(['custom_roles', 'limit', 1]); expect(calls).toContainEqual(['custom_roles', 'gt', 'id', id(1009)]);
  await expect(readMobileTeamSettings({ ...setup({ pages: [...pages, { data: [rows[1000]] }] }), identity })).rejects.toMatchObject({ status: 503, code: 'settings_catalog_limit' });
});
it('rejects malformed, foreign, regressing, duplicate, oversized or unknown-permission pages and query errors', async () => {
  for (const pages of [[{ data: null }], [{ data: [], error: true }], [{ data: [{ ...role(), team_id: id(90) }] }], [{ data: [role(11), role(10)] }],
    [{ data: [role(10)] }, { data: [role(10)] }], [{ data: [{ ...role(), permissions: ['system.superuser'] }] }], [{ data: [{ ...role(), name: 'x'.repeat(161) }] }],
    [{ data: Array.from({ length: 101 }, (_, index) => role(index + 10)) }]]) await expect(readMobileTeamSettings({ ...setup({ pages }), identity })).rejects.toMatchObject({ status: 503 });
  for (const options of [{ settingsError: true }, { settings: { ...settings, team_id: id(90) } }, { settings: { ...settings, default_call_time: '25:00' } }, { settings: { ...settings, dashboard_widgets: null } }]) await expect(readMobileTeamSettings({ ...setup(options), identity })).rejects.toMatchObject({ status: 503 });
});
it('honors effective either-permission gates and rejects stale role or exact permission changes', async () => {
  for (const permission of ['members.manage', 'team.manage'] as const) {
    const delegated = { ...identity, role: 'member', permissions: [permission] }; mocks.selected.mockResolvedValue(delegated);
    expect((await readMobileTeamSettings({ ...setup(), identity: delegated })).identity).toEqual(delegated);
  }
  const denied = { ...identity, role: 'owner', permissions: [] }; const { client, from } = setup();
  await expect(readMobileTeamSettings({ client, identity: denied })).rejects.toMatchObject({ status: 403 }); expect(from).not.toHaveBeenCalled();
  for (const changed of [{ ...identity, memberId: id(90) }, { ...identity, role: 'owner' }, { ...identity, permissions: ['members.manage', 'songs.create'] }]) {
    mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce(changed);
    await expect(readMobileTeamSettings({ ...setup(), identity })).rejects.toMatchObject({ status: 409 });
  }
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, permissions: [] });
  await expect(readMobileTeamSettings({ ...setup(), identity })).rejects.toMatchObject({ status: 403 });
});
it('attaches cancellation to actual query builders and never returns data after an aborted read', async () => {
  const controller = new AbortController(); const { client, calls } = setup();
  await readMobileTeamSettings({ client, identity, signal: controller.signal });
  expect(calls.filter(call => call[1] === 'abortSignal')).toHaveLength(3);
  controller.abort(); const unopened = setup(); await expect(readMobileTeamSettings({ ...unopened, identity, signal: controller.signal })).rejects.toThrow(); expect(unopened.from).not.toHaveBeenCalled();
  const midway = new AbortController(); const interrupted = setup({ onResponse: table => { if (table === 'custom_roles') midway.abort(); } });
  await expect(readMobileTeamSettings({ ...interrupted, identity, signal: midway.signal })).rejects.toThrow();
});
