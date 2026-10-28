// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { id, setlistCreateCommand, setlistSaveCommand } from '@/lib/mobile/v2/setlist-command-test-fixture';
import { setlistReceiptIdentity as identity, setlistApplied } from '@/lib/mobile/v2/setlist-result-test-fixture';
import { readMobileSetlistCreateReview } from './setlist-create-review';

const command = setlistCreateCommand();
const request = { version: 2 as const, requestId: id(300), command };
const receipt = { commandId: command.commandId, setlistId: command.setlistId, type: command.type, payloadHash: 'a'.repeat(64),
  status: 'rejected', code: 'permission', message: 'Keep the draft.' };
const review = { version: 2, requestId: request.requestId, identity, receipt, targetAbsent: true, checkedAt: '2026-10-19T00:00:00Z' };
function client(data: unknown = review, status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://setlist-create-review.test', 'synthetic-publishable', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(data, { status });
    } },
  });
  return { database, calls };
}
it('sends only the selected member and original command to the read-only review RPC', async () => {
  const { database, calls } = client();
  expect(await readMobileSetlistCreateReview({ client: database, identity, request })).toEqual(review);
  expect(calls).toEqual([{ url: 'https://setlist-create-review.test/rest/v1/rpc/mobile_read_setlist_create_review',
    body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request_id: request.requestId, p_command: command } }]);
});
it('refuses non-create and foreign related records before calling the RPC', async () => {
  const { database, calls } = client();
  await expect(readMobileSetlistCreateReview({ client: database, identity, request: { ...request, command: setlistSaveCommand() } })).rejects.toThrow();
  const foreign = { ...command, linkedEventBase: setlistSaveCommand().linkedEventBase };
  if (!foreign.linkedEventBase) throw new Error('Expected linked event fixture.');
  foreign.linkedEventBase.team_id = id(999); foreign.value = { ...foreign.value, form: { ...foreign.value.form, eventId: foreign.linkedEventBase.id } };
  await expect(readMobileSetlistCreateReview({ client: database, identity, request: { ...request, command: foreign } })).rejects.toMatchObject({ status: 400 });
  expect(calls).toEqual([]);
});
it('refuses substituted identities, request IDs, receipt IDs, applied receipts and incomplete checks', async () => {
  for (const data of [null, { ...review, identity: { ...identity, userId: id(99) } }, { ...review, requestId: id(99) },
    { ...review, receipt: { ...receipt, setlistId: id(99) } }, { ...review, receipt: setlistApplied(command) },
    { ...review, targetAbsent: false }, { ...review, checkedAt: null }]) {
    await expect(readMobileSetlistCreateReview({ client: client(data).database, identity, request })).rejects.toMatchObject({ status: 503, code: 'unavailable' });
  }
});
it.each([['42501', 403, 'permission'], ['PGRST301', 401, 'permission'], ['P0002', 409, 'review_unavailable'],
  ['40001', 409, 'retry'], ['40P01', 409, 'retry'], ['22023', 400, 'validation'], ['PGRST202', 503, 'unavailable']] as const)(
  'maps SQL %s to safe %s/%s without foreign details or a scope lock', async (code, status, safeCode) => {
    const action = readMobileSetlistCreateReview({ client: client({ code, message: 'foreign private content' }, 400).database, identity, request });
    await expect(action).rejects.toMatchObject({ status, code: safeCode });
    await expect(action).rejects.not.toHaveProperty('message', 'foreign private content');
  });
