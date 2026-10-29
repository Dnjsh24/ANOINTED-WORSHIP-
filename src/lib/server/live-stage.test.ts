// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import type { LiveStageRequest } from '@/lib/domain/live-stage';
import { applyLiveStageRequest } from './live-stage';
const id = (number: number) => `97000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3) };
const layout = [id(10), id(11)];
const request: LiveStageRequest = { action: 'publish', orderedSlotIds: layout, sessionId: id(20), sequence: 1, cursor: { slotId: id(11), sectionIndex: 2 } };
const result = () => ({ version: 1, teamId: identity.teamId, setlistId: id(4), serverNow: '2026-10-21T00:00:00Z', fenceSessionId: id(20),
  state: { sessionId: id(20), publisherMemberId: identity.memberId, sequence: 1, orderedSlotIds: layout, cursor: { slotId: id(11), sectionIndex: 2 }, expiresAt: '2026-10-21T00:00:25Z' } });
function client(payload: unknown, status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://live-stage.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, input) => { calls.push({ url: String(url), body: JSON.parse(String(input?.body)) }); return Response.json(payload, { status }); } } });
  return { database, calls };
}
it('binds the same authenticated web/native helper to exact selected team, member and occurrence layout', async () => {
  const sender = client(result());
  expect(await applyLiveStageRequest({ client: sender.database, identity, setlistId: id(4), request })).toEqual(result());
  expect(sender.calls).toEqual([{ url: 'https://live-stage.test/rest/v1/rpc/stage_live_cursor', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: id(4), p_request: request } }]);
});
it('rejects wrong target, publisher, session, sequence, layout and cursor confirmations', async () => {
  const state = result().state;
  for (const payload of [{ ...result(), teamId: id(99) }, { ...result(), setlistId: id(99) },
    { ...result(), state: null }, { ...result(), state: { ...state, publisherMemberId: id(99) } },
    { ...result(), state: { ...state, sequence: 2 } }, { ...result(), state: { ...state, orderedSlotIds: [...layout].reverse() } },
    { ...result(), state: { ...state, cursor: { ...state.cursor, sectionIndex: 3 } } }]) {
    await expect(applyLiveStageRequest({ client: client(payload).database, identity, setlistId: id(4), request })).rejects.toMatchObject({ status: 503 });
  }
});
it.each([['42501', 403], ['PGRST301', 401], ['40001', 409], ['40P01', 409], ['22023', 400], ['22P02', 400], ['PGRST202', 503]] as const)('maps SQL %s without exposing private database details', async (code, status) => {
  await expect(applyLiveStageRequest({ client: client({ code, message: 'private detail' }, 400).database, identity, setlistId: id(4), request })).rejects.toMatchObject({ status });
});
