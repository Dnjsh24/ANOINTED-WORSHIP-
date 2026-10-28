// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { teamNoticeIdentity as identity, teamNoticeId as id } from '@/lib/mobile/v2/team-notices-test-fixture';
import type { TeamNoticeAckRequest } from '@/lib/mobile/v2/team-notice-ack';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { acknowledgeMobileTeamNotice } from './team-notice-ack';
const request: TeamNoticeAckRequest = { version: 2, kind: 'announcement', targetId: id(4), requestNonce: id(9), acknowledged: true };
const old = '2026-10-20T00:00:00Z'; const now = '2026-10-21T05:00:00.000Z';
const announcement = { id: id(4), team_id: id(2), target_role: null, target_profile_id: null };
const ownReceipt = { announcement_id: id(4), team_id: id(2), profile_id: id(1), read_at: null as string | null, acknowledged_at: null as string | null };
const reminder = { id: id(4), team_id: id(2), profile_id: id(1), read_at: null as string | null, acknowledged_at: null as string | null, scheduled_for: old };
function setup(options: { announcement?: unknown; receipt?: typeof ownReceipt | null; reminder?: typeof reminder; competingTime?: string; writeError?: boolean; hideAfterWrite?: boolean } = {}) {
  let own = options.receipt === undefined ? { ...ownReceipt } : options.receipt; let notice = { ...options.reminder ?? reminder }; const calls: unknown[][] = []; let wrote = false;
  const from = vi.fn((table: string) => {
    let mode = 'read'; let patch: Record<string, unknown> = {}; let ignore = false; const filters: unknown[][] = [];
    const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(['eq', ...args]); return query; }, is: (...args: unknown[]) => { filters.push(['is', ...args]); return query; },
      lte: (...args: unknown[]) => { filters.push(['lte', ...args]); return query; }, abortSignal: () => query,
      upsert: (value: Record<string, unknown>, settings: { ignoreDuplicates: boolean }) => { mode = 'insert'; patch = value; ignore = settings.ignoreDuplicates; return query; },
      update: (value: Record<string, unknown>) => { mode = 'update'; patch = value; return query; },
      maybeSingle: async () => {
        calls.push([table, mode, ...filters]);
        return { data: table === 'announcements' ? options.hideAfterWrite && wrote ? null : options.announcement === undefined ? announcement : options.announcement : table === 'announcement_receipts' ? own : notice, error: null };
      },
      then: <T>(resolve: (value: { data: null; error: { code: string } | null }) => T) => {
        calls.push([table, mode, patch, ...filters]); wrote = true;
        if (!options.writeError) {
          if (options.competingTime) {
            if (table === 'announcement_receipts') own = { ...ownReceipt, read_at: options.competingTime, acknowledged_at: options.competingTime };
            else notice = { ...notice, read_at: options.competingTime, acknowledged_at: options.competingTime };
          }
          if (mode === 'insert') { expect(ignore).toBe(true); if (!own) own = { ...ownReceipt, ...patch }; }
          else if (table === 'announcement_receipts' && own && !own.acknowledged_at) own = { ...own, ...patch };
          else if (table === 'notifications' && !notice.acknowledged_at) notice = { ...notice, ...patch };
        }
        return Promise.resolve({ data: null, error: options.writeError ? { code: 'XX000' } : null }).then(resolve);
      } };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient<Database>, calls, from, receipt: () => own, notice: () => notice };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
afterEach(() => vi.useRealTimers());
it('acknowledges only the own announcement receipt and echoes actual persisted time', async () => {
  const database = setup(); const result = await acknowledgeMobileTeamNotice({ ...database, identity, request });
  expect(result).toEqual({ ...request, userId: id(1), teamId: id(2), memberId: id(3), acknowledgedAt: now });
  expect(database.calls).toContainEqual(['announcement_receipts', 'update', { read_at: now, acknowledged_at: now }, ['eq', 'announcement_id', id(4)], ['eq', 'team_id', id(2)], ['eq', 'profile_id', id(1)], ['is', 'acknowledged_at', null]]);
  expect(mocks.selected).toHaveBeenCalledTimes(2);
});
it('creates an absent receipt without overwriting a concurrent first acknowledgement', async () => {
  const database = setup({ receipt: null, competingTime: old });
  const result = await acknowledgeMobileTeamNotice({ ...database, identity, request }); expect(result.acknowledgedAt).toBe(old); expect(database.receipt()?.acknowledged_at).toBe(old);
});
it('retries lost replies naturally without rewriting an existing timestamp or read time', async () => {
  for (const kind of ['announcement', 'reminder'] as const) {
    const database = setup({ receipt: { ...ownReceipt, acknowledged_at: old, read_at: old }, reminder: { ...reminder, acknowledged_at: old, read_at: old } });
    const result = await acknowledgeMobileTeamNotice({ ...database, identity, request: { ...request, kind } }); expect(result.acknowledgedAt).toBe(old);
    expect(database.calls.some(call => call[1] === 'update' || call[1] === 'insert')).toBe(false);
  }
});
it('acknowledges only a due own reminder and preserves an earlier read time', async () => {
  const database = setup({ reminder: { ...reminder, read_at: old } }); const result = await acknowledgeMobileTeamNotice({ ...database, identity, request: { ...request, kind: 'reminder' } });
  expect(result.acknowledgedAt).toBe(now); expect(database.notice().read_at).toBe(old);
  expect(database.calls).toContainEqual(['notifications', 'update', { read_at: old, acknowledged_at: now }, ['eq', 'id', id(4)], ['eq', 'team_id', id(2)], ['eq', 'profile_id', id(1)], ['is', 'acknowledged_at', null], ['lte', 'scheduled_for', now]]);
});
it('rejects another profile, foreign team, hidden targets and future reminders before mutation', async () => {
  for (const options of [{ announcement: null }, { announcement: { ...announcement, team_id: id(90) } }, { announcement: { ...announcement, target_profile_id: id(90) } }]) {
    const database = setup(options); await expect(acknowledgeMobileTeamNotice({ ...database, identity, request })).rejects.toMatchObject({ status: 403 }); expect(database.calls.some(call => call[1] === 'update')).toBe(false);
  }
  for (const row of [{ ...reminder, profile_id: id(90) }, { ...reminder, team_id: id(90) }, { ...reminder, scheduled_for: '2027-01-01T00:00:00Z' }]) await expect(acknowledgeMobileTeamNotice({ ...setup({ reminder: row }), identity, request: { ...request, kind: 'reminder' } })).rejects.toMatchObject({ status: 403 });
});
it('never fabricates success after write errors, target deletion or changed membership after write', async () => {
  await expect(acknowledgeMobileTeamNotice({ ...setup({ writeError: true }), identity, request })).rejects.toMatchObject({ status: 503 });
  await expect(acknowledgeMobileTeamNotice({ ...setup({ hideAfterWrite: true }), identity, request })).rejects.toMatchObject({ status: 403 });
  mocks.selected.mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...identity, memberId: id(90) });
  await expect(acknowledgeMobileTeamNotice({ ...setup(), identity, request })).rejects.toMatchObject({ status: 409 });
});
it('honors cancellation before querying or writing', async () => {
  const controller = new AbortController(); controller.abort(); const database = setup();
  await expect(acknowledgeMobileTeamNotice({ ...database, identity, request, signal: controller.signal })).rejects.toThrow(); expect(database.from).not.toHaveBeenCalled();
});
