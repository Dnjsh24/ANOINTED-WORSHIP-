// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileProfileFixture as expected, profileTestId as id } from '@/lib/mobile/v2/profile-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileProfile } from './profile';
const identity = expected.identity;
const profile = { id: id(1), full_name: 'Worship member', email: 'member@example.test', birthday: '1990-05-10' };
const member = { id: id(3), team_id: id(2), profile_id: id(1), role: 'band_member', ministries: ['Guitar'], created_at: '2025-01-01T00:00:00Z', team_anniversary: '2025-01-01', status: 'active' };
const attendance = (n: number, status = 'available') => ({ id: id(n), team_member_id: id(3), status, events: { team_id: id(2), event_date: '2026-10-20' } });
function setup(options: { profile?: unknown; member?: unknown; pages?: unknown[][]; statsError?: boolean } = {}) {
  let pageIndex = 0; const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const response = { data: table === 'profiles' ? options.profile === undefined ? profile : options.profile : table === 'team_members' ? options.member === undefined ? member : options.member : options.pages?.[pageIndex++] ?? [],
      error: table === 'attendance' && options.statsError ? { code: 'XX000' } : null };
    const query = { select: (...args: unknown[]) => { calls.push([table, 'select', ...args]); return query; }, eq: (...args: unknown[]) => { calls.push([table, 'eq', ...args]); return query; },
      lte: (...args: unknown[]) => { calls.push([table, 'lte', ...args]); return query; }, order: () => query, gt: (...args: unknown[]) => { calls.push([table, 'gt', ...args]); return query; }, limit: () => query,
      abortSignal: () => query, maybeSingle: () => Promise.resolve(response), then: <T>(resolve: (value: typeof response) => T) => Promise.resolve(response).then(resolve) };
    return query;
  });
  return { calls, from, client: { from } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(expected.fetchedAt); mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
afterEach(() => vi.useRealTimers());
it('reads the exact own profile and selected membership, then computes website available/past-response ratio', async () => {
  const { client, calls } = setup({ pages: [[attendance(10), attendance(11, 'maybe')], [attendance(12)], []] });
  expect(await readMobileProfile({ client, identity })).toEqual({ ...expected, fetchedAt: new Date(expected.fetchedAt).toISOString() });
  expect(calls).toEqual(expect.arrayContaining([['profiles', 'eq', 'id', id(1)], ['team_members', 'eq', 'id', id(3)], ['team_members', 'eq', 'team_id', id(2)],
    ['team_members', 'eq', 'profile_id', id(1)], ['attendance', 'eq', 'team_member_id', id(3)], ['attendance', 'eq', 'events.team_id', id(2)], ['attendance', 'lte', 'events.event_date', '2026-10-21'], ['attendance', 'gt', 'id', id(11)]]));
  expect(mocks.selected).toHaveBeenCalledTimes(2);
});
it('reports no-response attendance as unknown instead of a fabricated 100%', async () => {
  const actual = await readMobileProfile({ ...setup(), identity });
  expect(actual.stats.attendance).toMatchObject({ status: 'complete', availableCount: 0, responseCount: 0, rate: null });
});
it('returns partial counts and no rate when more than1000 records exist', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => attendance(index + 10));
  const pages = Array.from({ length: 11 }, (_, index) => rows.slice(index * 100, index * 100 + 100));
  const actual = await readMobileProfile({ ...setup({ pages }), identity });
  expect(actual.stats.attendance).toMatchObject({ status: 'partial', availableCount: 1000, responseCount: 1000, rate: null });
});
it('never treats failed, foreign-member/team, future or regressed attendance as a complete rate', async () => {
  for (const options of [{ statsError: true }, { pages: [[{ ...attendance(10), team_member_id: id(90) }]] },
    { pages: [[{ ...attendance(10), events: { team_id: id(90), event_date: '2026-10-20' } }]] }, { pages: [[{ ...attendance(10), events: { team_id: id(2), event_date: '2027-01-01' } }]] },
    { pages: [[attendance(11), attendance(10)]] }]) {
    expect((await readMobileProfile({ ...setup(options), identity })).stats.attendance).toMatchObject({ status: 'unavailable', availableCount: null, responseCount: null, rate: null });
  }
});
it('rejects other users or memberships and changed authorization before returning private profile data', async () => {
  for (const options of [{ profile: { ...profile, id: id(90) } }, { profile: null }, { member: { ...member, id: id(90) } }, { member: { ...member, team_id: id(90) } },
    { member: { ...member, profile_id: id(90) } }, { member: { ...member, status: 'inactive' } }]) await expect(readMobileProfile({ ...setup(options), identity })).rejects.toMatchObject({ status: 503 });
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(readMobileProfile({ ...setup(), identity })).rejects.toMatchObject({ status: 409 });
});
it('honors cancellation before querying any private data', async () => {
  const controller = new AbortController(); controller.abort(); const { client, from } = setup();
  await expect(readMobileProfile({ client, identity, signal: controller.signal })).rejects.toThrow(); expect(from).not.toHaveBeenCalled();
});
