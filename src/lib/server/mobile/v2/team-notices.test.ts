// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { teamAnnouncement, teamNoticeIdentity as identity, teamNoticeId as id, teamNoticeTime as time, teamReminder } from '@/lib/mobile/v2/team-notices-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileTeamNotices } from './team-notices';
const announcement = { id: id(4), team_id: id(2), title: teamAnnouncement.title, body: teamAnnouncement.body, category: teamAnnouncement.category, target_label: 'All team', target_role: null, target_profile_id: null,
  priority: 'important', is_pinned: true, event_id: id(7), events: { name: 'Sunday service' }, created_at: time, created_by: id(8) };
const reminder = { id: id(5), team_id: id(2), profile_id: id(1), title: teamReminder.title, body: teamReminder.body, target_path: '/events', target_label: 'Band', target_role: 'band_member', target_profile_id: null,
  priority: 'normal', event_id: id(7), created_at: time, created_by: id(8), read_at: null, acknowledged_at: null, scheduled_for: time, recurrence_rule: 'weekly', recurrence_index: 1, recurrence_total: 4, notice_group_id: id(9) };
function setup(rows: unknown[] = [announcement], receipts: unknown[] = [{ announcement_id: id(4), profile_id: id(1), acknowledged_at: time }], error = false) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const response = { data: table === 'announcement_receipts' ? receipts : rows, error: error ? { code: 'XX000' } : null };
    const query = { select: (value: string) => { calls.push([table, 'select', value]); return query; }, eq: (...values: unknown[]) => { calls.push([table, 'eq', ...values]); return query; },
      lte: (...values: unknown[]) => { calls.push([table, 'lte', ...values]); return query; }, order: (...values: unknown[]) => { calls.push([table, 'order', ...values]); return query; },
      limit: (...values: unknown[]) => { calls.push([table, 'limit', ...values]); return query; }, gt: (...values: unknown[]) => { calls.push([table, 'gt', ...values]); return query; },
      in: (...values: unknown[]) => { calls.push([table, 'in', ...values]); return query; }, abortSignal: () => query,
      then: <T>(resolve: (value: typeof response) => T) => Promise.resolve(response).then(resolve) };
    return query;
  });
  return { calls, from, client: { from } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-10-21T05:00:00Z'); mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
afterEach(() => vi.useRealTimers());
it('reads full website announcement fields, pinned state, event and own receipt behind selected-team membership', async () => {
  const { client, calls } = setup(); const page = await readMobileTeamNotices({ client, identity, input: { kind: 'announcements', asOf: time } });
  expect(page.items).toEqual([teamAnnouncement]); expect(page.nextCursor).toEqual({ after: id(4), asOf: time });
  expect(mocks.selected).toHaveBeenCalledTimes(2); expect(calls).toContainEqual(['announcements', 'eq', 'team_id', id(2)]);
  expect(calls).toContainEqual(['announcement_receipts', 'eq', 'profile_id', id(1)]);
});
it('always filters personal reminders by actor, team and due time even for managers', async () => {
  const manager = { ...identity, role: 'admin' }; mocks.selected.mockResolvedValue(manager);
  const { client, calls } = setup([reminder]); const page = await readMobileTeamNotices({ client, identity: manager, input: { kind: 'reminders', asOf: time } });
  expect(page.items).toEqual([teamReminder]); expect(calls).toContainEqual(['notifications', 'eq', 'profile_id', id(1)]); expect(calls).toContainEqual(['notifications', 'lte', 'scheduled_for', time]);
});
it('continues after a short capped page and only returns exhaustion on an empty page', async () => {
  const { client, calls } = setup([]); const page = await readMobileTeamNotices({ client, identity, input: { kind: 'announcements', after: id(4), asOf: time } });
  expect(page.items).toEqual([]); expect(page.nextCursor).toBeNull(); expect(calls).toContainEqual(['announcements', 'gt', 'id', id(4)]);
});
it('denies foreign teams, other-member receipts/reminders, untargeted announcements and future reminders', async () => {
  for (const row of [{ ...announcement, team_id: id(99) }, { ...announcement, target_profile_id: id(99) }, { ...announcement, target_role: 'admin' }]) {
    await expect(readMobileTeamNotices({ ...setup([row]), identity, input: { kind: 'announcements', asOf: time } })).rejects.toMatchObject({ status: 503 });
  }
  for (const row of [{ ...reminder, profile_id: id(99) }, { ...reminder, team_id: id(99) }, { ...reminder, scheduled_for: '2027-01-01T00:00:00Z' }]) {
    await expect(readMobileTeamNotices({ ...setup([row]), identity, input: { kind: 'reminders', asOf: time } })).rejects.toMatchObject({ status: 503 });
  }
  await expect(readMobileTeamNotices({ ...setup([announcement], [{ announcement_id: id(4), profile_id: id(99), acknowledged_at: time }]), identity, input: { kind: 'announcements', asOf: time } })).rejects.toMatchObject({ status: 503 });
});
it('fails closed when authority changes during read, queries fail, or cancellation occurs', async () => {
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, memberId: id(99) });
  await expect(readMobileTeamNotices({ ...setup(), identity, input: { kind: 'announcements' } })).rejects.toMatchObject({ status: 409 });
  mocks.selected.mockResolvedValue(identity);
  await expect(readMobileTeamNotices({ ...setup([], [], true), identity, input: { kind: 'reminders' } })).rejects.toMatchObject({ status: 503 });
  const controller = new AbortController(); controller.abort(); const { client, from } = setup();
  await expect(readMobileTeamNotices({ client, identity, input: { kind: 'reminders' }, signal: controller.signal })).rejects.toThrow(); expect(from).not.toHaveBeenCalled();
});
