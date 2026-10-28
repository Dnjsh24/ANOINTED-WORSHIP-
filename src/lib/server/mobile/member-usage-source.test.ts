// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { memberUsageIdentity as identity, memberUsageTestId as id } from '@/lib/mobile/v2/member-usage-test-fixture';
import { loadMemberUsageDays, loadMemberUsageStates } from './member-usage-source';
const row = (n: number) => ({ member_id: id(n), team_id: identity.teamId, usage_date: '2026-10-05', active_minutes: 1, sessions: 1 });
const response = (data: unknown) => new Response(JSON.stringify(data));
const clientFor = (fetch: typeof globalThis.fetch) => createClient<Database>('http://localhost:54321', 'test-key', { global: { fetch }, auth: { persistSession: false } });
describe('team-scoped member usage reads', () => {
  it('paginates to empty with team+UTC filters and a composite member/date cursor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(Array.from({ length: 1000 }, (_, n) => row(n + 1))))
      .mockResolvedValueOnce(response([row(1001)])).mockResolvedValueOnce(response([]));
    const result = await loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-05');
    expect(result.kind === 'ready' && result.rows.length).toBe(1001); expect(fetch).toHaveBeenCalledTimes(3);
    const url = new URL(String(fetch.mock.calls[0][0])); expect(url.searchParams.get('team_id')).toBe(`eq.${identity.teamId}`);
    expect(url.searchParams.getAll('usage_date')).toEqual(['gte.2026-10-01', 'lte.2026-10-05']);
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get('or')).toBe(`(member_id.gt.${id(1000)},and(member_id.eq.${id(1000)},usage_date.gt.2026-10-05))`);
  });
  it('does not mistake capped short pages for complete usage', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([row(1)])).mockResolvedValueOnce(response([{ ...row(1), usage_date: '2026-10-06' }])).mockResolvedValueOnce(response([]));
    const result = await loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07');
    expect(result.kind === 'ready' && result.rows.length).toBe(2); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('discards partial data on later failure, missing data or repeated/regressed cursor', async () => {
    for (const last of [response(null), new Response(JSON.stringify({ code: '42501' }), { status: 403 }), response([row(1)])]) {
      const fetch = vi.fn().mockResolvedValueOnce(response([row(1)])).mockResolvedValueOnce(last);
      expect((await loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07')).kind).toBe('unavailable');
    }
  });
  it('rejects malformed, foreign, out-of-range or impossible daily rows', async () => {
    for (const change of [{ team_id: id(90) }, { member_id: 'bad' }, { usage_date: '2026-10-08' }, { active_minutes: 1441 }, { sessions: -1 }]) {
      const fetch = vi.fn().mockResolvedValue(response([{ ...row(1), ...change }]));
      expect((await loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07')).kind).toBe('unavailable');
    }
  });
  it('reports overflow honestly rather than partial50000row success', async () => {
    let offset = 0; const fetch = vi.fn().mockImplementation(async () => { const data = Array.from({ length: 1000 }, (_, n) => row(offset + n + 1)); offset += 1000; return response(data); });
    expect((await loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07')).kind).toBe('unavailable'); expect(fetch).toHaveBeenCalledTimes(51);
  });
  it('honors cancellation before/after reads and rejects invalid ranges before querying', async () => {
    const controller = new AbortController(); const fetch = vi.fn().mockImplementation(async () => { controller.abort(); return response([]); });
    await expect(loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07', { signal: controller.signal })).rejects.toThrow();
    const calls = fetch.mock.calls.length;
    await expect(loadMemberUsageDays(clientFor(fetch), identity.teamId, '2026-10-01', '2026-10-07', { signal: controller.signal })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(calls);
    expect((await loadMemberUsageDays(clientFor(fetch), identity.teamId, 'bad', '2026-10-07')).kind).toBe('unavailable'); expect(fetch).toHaveBeenCalledTimes(calls);
  });
  it('reports missing schema without treating it as zero usage', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'PGRST205', message: 'table missing' }), { status: 404 }));
    expect(await loadMemberUsageStates(clientFor(fetch), identity.teamId)).toEqual({ kind: 'unavailable', message: 'Usage tracking is unavailable until the member usage migration is deployed.' });
  });
});
