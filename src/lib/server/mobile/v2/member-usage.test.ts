// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { memberUsageFixture as fixture, memberUsageIdentity as identity, memberUsageInput as input, memberUsageTestId as id } from '@/lib/mobile/v2/member-usage-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), days: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/member-usage-source', () => ({ loadMemberUsageDays: mocks.days }));
import { readMobileMemberUsage } from './member-usage';
const member = { id: id(4), team_id: identity.teamId, profile_id: id(5), profiles: { id: id(5), full_name: 'Actual member' } };
function setup(data: unknown = [member], error = false) {
  const calls: unknown[][] = []; let cursor: string | null = null;
  const query = { select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; }, eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return query; }, limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query; },
    gt: (_column: string, value: string) => { cursor = value; return query; }, abortSignal: () => query,
    then: <T>(resolve: (value: { data: unknown; error: unknown }) => T) => Promise.resolve({ data: cursor ? [] : data, error: error ? { code: '42501' } : null }).then(resolve) };
  const from = vi.fn(() => query); return { client: { from } as unknown as SupabaseClient<Database>, calls, from };
}
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue(identity); if (fixture.kind !== 'ready') throw new Error('Ready fixture required'); mocks.days.mockResolvedValue({ kind: 'ready', rows: fixture.rows }); });
it('reads actual UTC days and selected-team names with current owner/admin authority pre/post and complete name paging', async () => {
  const { client, calls, from } = setup(); const signal = new AbortController().signal;
  const result = await readMobileMemberUsage({ client, identity, input, signal });
  expect(result).toMatchObject({ ...fixture, fetchedAt: expect.any(String) }); expect(mocks.selected).toHaveBeenCalledTimes(2);
  expect(mocks.days).toHaveBeenCalledWith(client, identity.teamId, input.start, input.end, { signal }); expect(from).toHaveBeenCalledTimes(2);
  expect(calls).toEqual(expect.arrayContaining([['eq', 'team_id', identity.teamId], ['order', 'id'], ['limit', 500]]));
});
it('denies delegated members and rejects role/member/team/permission changes after loading', async () => {
  const actor = { ...identity, role: 'member' }; mocks.selected.mockResolvedValueOnce(actor);
  await expect(readMobileMemberUsage({ ...setup(), identity: actor, input })).rejects.toMatchObject({ status: 403 }); expect(mocks.days).not.toHaveBeenCalled();
  for (const change of [{ teamId: id(90) }, { memberId: id(90) }, { role: 'owner' }, { permissions: [] }]) {
    mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, ...change });
    await expect(readMobileMemberUsage({ ...setup(), identity, input })).rejects.toMatchObject({ status: 409 });
  }
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, role: 'member' });
  await expect(readMobileMemberUsage({ ...setup(), identity, input })).rejects.toMatchObject({ status: 403 });
});
it('rejects foreign/missing/substituted/duplicate member-profile joins, query failures and unknown usage members without partial success', async () => {
  for (const rows of [[{ ...member, team_id: id(90) }], [{ ...member, profiles: null }], [{ ...member, profiles: [] }], [{ ...member, profiles: { ...member.profiles, id: id(90) } }], [member, member],
    [member, { ...member, id: id(90) }], []]) expect((await readMobileMemberUsage({ ...setup(rows), identity, input })).kind).toBe('unavailable');
  expect((await readMobileMemberUsage({ ...setup(null, true), identity, input })).kind).toBe('unavailable');
});
it('does not invent names for nullable profiles or replace unavailable migration data with empty usage', async () => {
  const result = await readMobileMemberUsage({ ...setup([{ ...member, profiles: [{ ...member.profiles, full_name: null }] }]), identity, input });
  expect(result.kind === 'ready' && result.memberNames).toEqual({});
  mocks.days.mockResolvedValueOnce({ kind: 'unavailable', message: 'Usage tracking is unavailable until the member usage migration is deployed.' }); const { client, from } = setup();
  expect(await readMobileMemberUsage({ client, identity, input })).toMatchObject({ kind: 'unavailable', message: 'Usage tracking is unavailable until the member usage migration is deployed.' }); expect(from).not.toHaveBeenCalled();
});
it('honors cancellation before queries and does not return data after membership verification fails', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readMobileMemberUsage({ ...setup(), identity, input, signal: controller.signal })).rejects.toThrow(); expect(mocks.days).not.toHaveBeenCalled();
  mocks.selected.mockResolvedValueOnce(identity).mockRejectedValueOnce(new Error('Membership unavailable'));
  await expect(readMobileMemberUsage({ ...setup(), identity, input })).rejects.toThrow('Membership unavailable');
});
