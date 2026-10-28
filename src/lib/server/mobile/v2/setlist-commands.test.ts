// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { setlistCreateCommand, setlistDeleteCommand, setlistSaveCommand, id } from '@/lib/mobile/v2/setlist-command-test-fixture';
import { setlistApplied, setlistDeleteReview, setlistReceiptIdentity as identity } from '@/lib/mobile/v2/setlist-result-test-fixture';
import { applyMobileSetlistCommands, readMobileSetlistDeleteScope } from './setlist-commands';
function client(data: unknown = [setlistApplied(setlistSaveCommand())], status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://setlist-command.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(data, { status }); } } });
  return { database, calls };
}
it('binds the bearer client and selected team/member to the named setlist RPC', async () => {
  const { database, calls } = client(); const command = setlistSaveCommand();
  expect(await applyMobileSetlistCommands({ client: database, identity, request: { version: 2, commands: [command] } })).toEqual({ version: 2, identity, results: [setlistApplied(command)] });
  expect(calls).toEqual([{ url: 'https://setlist-command.test/rest/v1/rpc/mobile_apply_setlist_commands', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: [command] } }]);
});
it('rejects a foreign original base before any database call', async () => {
  const { database, calls } = client(); const command = setlistSaveCommand(); command.baseValue!.record.team_id = id(99); command.baseValue!.linkedEvent = null; command.linkedEventBase = null;
  await expect(applyMobileSetlistCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 400 }); expect(calls).toEqual([]);
});
it('refuses incomplete, reordered, substituted and semantically wrong confirmations', async () => {
  const first = setlistSaveCommand(); const second = { ...setlistCreateCommand(), commandId: id(82) }; const receipt = setlistApplied(first);
  for (const data of [[], [receipt, receipt], [{ ...receipt, commandId: id(99) }], [{ ...receipt, payloadHash: 'invalid' }]]) {
    await expect(applyMobileSetlistCommands({ client: client(data).database, identity, request: { version: 2, commands: [first] } })).rejects.toMatchObject({ status: 503 });
  }
  await expect(applyMobileSetlistCommands({ client: client([setlistApplied(second), receipt]).database, identity, request: { version: 2, commands: [first, second] } })).rejects.toMatchObject({ status: 503 });
  await expect(applyMobileSetlistCommands({ client: client([setlistApplied(setlistDeleteCommand())]).database, identity, request: { version: 2, commands: [first] } })).rejects.toMatchObject({ status: 503 });
});
it('returns complete verified deletion scope including tombstoned sibling setlists', async () => {
  const review = setlistDeleteReview(); review.siblings[0].record.deleted_at = '2026-10-18T00:00:00Z'; const { database, calls } = client(review);
  expect(await readMobileSetlistDeleteScope({ client: database, identity, setlistId: id(20) })).toEqual({ version: 2, identity, review });
  expect(calls).toEqual([{ url: 'https://setlist-command.test/rest/v1/rpc/mobile_read_setlist_delete_scope', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: id(20) } }]);
  const wrong = structuredClone(review); wrong.snapshot.record.id = id(99);
  await expect(readMobileSetlistDeleteScope({ client: client(wrong).database, identity, setlistId: id(20) })).rejects.toMatchObject({ status: 503 });
  await expect(readMobileSetlistDeleteScope({ client: client({ ...review, siblings: [] }).database, identity, setlistId: id(20) })).rejects.toMatchObject({ status: 503 });
});
it.each([['42501', 403], ['PGRST301', 401], ['40001', 409], ['40P01', 409], ['22023', 400], ['22P02', 400], ['23514', 400], ['PGRST202', 503]] as const)('maps SQL %s to safe HTTP %s without database details', async (code, status) => {
  for (const action of [() => applyMobileSetlistCommands({ client: client({ code, message: 'secret database detail' }, 400).database, identity, request: { version: 2, commands: [setlistSaveCommand()] } }),
    () => readMobileSetlistDeleteScope({ client: client({ code, message: 'secret database detail' }, 400).database, identity, setlistId: id(20) })]) {
    await expect(action()).rejects.toMatchObject({ status }); await expect(action()).rejects.not.toHaveProperty('message', 'secret database detail');
  }
});
