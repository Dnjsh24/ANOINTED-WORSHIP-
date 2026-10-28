// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { memberRosterIdentity as identity, memberRosterItem as member, rosterTestId as id } from '@/lib/mobile/v2/member-roster-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileMemberRoster } from './member-roster';
const row = { id: member.id, team_id: identity.teamId, profile_id: member.profileId, role: member.role, status: member.status, ministry: member.ministry, ministries: member.ministries,
  created_at: member.createdAt, profiles: { id: member.profileId, full_name: member.fullName, email: member.email } };
const asOf = '2026-10-21T04:00:00Z';
function setup(data: unknown = [row], error = false) {
  const calls: unknown[][] = []; const response = { data, error: error ? { code: 'XX000' } : null };
  const query = { select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; }, eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    lte: (...args: unknown[]) => { calls.push(['lte', ...args]); return query; }, order: (...args: unknown[]) => { calls.push(['order', ...args]); return query; }, limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query; },
    gt: (...args: unknown[]) => { calls.push(['gt', ...args]); return query; }, abortSignal: () => query,
    then: <T>(resolve: (value: typeof response) => T) => Promise.resolve(response).then(resolve) };
  const from = vi.fn(() => query); return { calls, from, client: { from } as unknown as SupabaseClient<Database> };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-10-21T05:00:00Z'); mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
afterEach(() => vi.useRealTimers());
it('returns only selected-team actual roster fields and checks current manager authority before and after reading', async () => {
  const { client, calls } = setup(); const result = await readMobileMemberRoster({ client, identity, input: { asOf } });
  expect(result.items).toEqual([member]); expect(result.nextCursor).toEqual({ after: member.id, asOf }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  expect(calls).toEqual(expect.arrayContaining([['eq', 'team_id', identity.teamId], ['lte', 'created_at', asOf], ['order', 'id', { ascending: true }], ['limit', 100]]));
});
it('allows a delegated member manager and denies an admin/owner without effective members.manage', async () => {
  const delegated = { ...identity, role: 'member' }; mocks.selected.mockResolvedValue(delegated);
  expect((await readMobileMemberRoster({ ...setup(), identity: delegated, input: {} })).items).toEqual([member]);
  for (const role of ['owner', 'admin']) {
    const denied = { ...identity, role, permissions: [] }; mocks.selected.mockResolvedValue(denied); const { client, from } = setup();
    await expect(readMobileMemberRoster({ client, identity: denied, input: {} })).rejects.toMatchObject({ status: 403 }); expect(from).not.toHaveBeenCalled();
  }
});
it('retains inactive status, nullable names and website legacy ministry fallback without invented data', async () => {
  const result = await readMobileMemberRoster({ ...setup([{ ...row, status: 'inactive', ministries: null, profiles: [{ ...row.profiles, full_name: null, email: null }] }]), identity, input: {} });
  expect(result.items[0]).toMatchObject({ status: 'inactive', fullName: null, email: null, ministries: ['Band'], avatarUrl: null });
});
it('continues after short capped pages and exhausts only after an empty page', async () => {
  const first = await readMobileMemberRoster({ ...setup(), identity, input: { asOf } }); expect(first.nextCursor).not.toBeNull();
  const { client, calls } = setup([]); const last = await readMobileMemberRoster({ client, identity, input: { after: member.id, asOf } });
  expect(last.nextCursor).toBeNull(); expect(last.items).toEqual([]); expect(calls).toContainEqual(['gt', 'id', member.id]);
});
it('fails a whole page on foreign team, missing/substituted/duplicate profiles, unknown roles or duplicate rows', async () => {
  for (const invalid of [[{ ...row, team_id: id(90) }], [{ ...row, profiles: null }], [{ ...row, profiles: [] }], [{ ...row, profiles: [row.profiles, row.profiles] }],
    [{ ...row, profiles: { ...row.profiles, id: id(90) } }], [{ ...row, role: 'invented' }], [row, row], [row, { ...row, id: id(90) }]]) {
    await expect(readMobileMemberRoster({ ...setup(invalid), identity, input: { asOf } })).rejects.toMatchObject({ status: 503 });
  }
});
it('fails closed on stale selected authority or query errors and honors cancellation', async () => {
  for (const change of [{ memberId: id(90) }, { role: 'member' }, { permissions: ['members.manage', 'events.manage'] }]) {
    mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, ...change });
    await expect(readMobileMemberRoster({ ...setup(), identity, input: {} })).rejects.toMatchObject({ status: 409 });
  }
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, permissions: [] });
  await expect(readMobileMemberRoster({ ...setup(), identity, input: {} })).rejects.toMatchObject({ status: 403 });
  mocks.selected.mockResolvedValue(identity); await expect(readMobileMemberRoster({ ...setup(null, true), identity, input: {} })).rejects.toMatchObject({ status: 503 });
  const controller = new AbortController(); controller.abort(); const { client, from } = setup();
  await expect(readMobileMemberRoster({ client, identity, input: {}, signal: controller.signal })).rejects.toThrow(); expect(from).not.toHaveBeenCalled();
});
it('rejects future cutoffs and regressed cursors without silently omitting members', async () => {
  await expect(readMobileMemberRoster({ ...setup(), identity, input: { asOf: '2027-01-01T00:00:00Z' } })).rejects.toMatchObject({ status: 400 });
  await expect(readMobileMemberRoster({ ...setup(), identity, input: { after: member.id, asOf } })).rejects.toMatchObject({ status: 503 });
});
