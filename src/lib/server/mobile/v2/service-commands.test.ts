// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileServiceCommand } from '@/lib/mobile/v2/service-commands';
import { id, serviceApplied, serviceOrder, serviceReceiptIdentity as identity } from '@/lib/mobile/v2/service-command-test-fixture';
import { applyMobileServiceCommands } from './service-commands';

function client(data: unknown = [serviceApplied(serviceOrder())], status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://service-command.test', 'test-publishable', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(data, { status }); } } });
  return { database, calls };
}
it('uses the verified bearer client and exact named service RPC with selected team/member', async () => {
  const { database, calls } = client(); const command = serviceOrder(); const result = await applyMobileServiceCommands({ client: database, identity, request: { version: 2, commands: [command] } });
  expect(result).toEqual({ version: 2, identity, results: [serviceApplied(command)] });
  expect(calls).toEqual([{ url: 'https://service-command.test/rest/v1/rpc/mobile_apply_service_commands', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: [command] } }]);
});
it('rejects cross-team bases before calling the database and never uses client-supplied actors', async () => {
  const { database, calls } = client(); const command = serviceOrder(); command.baseOrder!.team_id = id(99);
  await expect(applyMobileServiceCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 400 }); expect(calls).toEqual([]);
});
it('verifies every returned result and refuses malformed, substituted, reordered or incomplete acknowledgements', async () => {
  const first = serviceOrder(); const second = serviceOrder(id(81), id(11)); const receipt = serviceApplied(first);
  for (const data of [[], [receipt, receipt], [{ ...receipt, commandId: id(99) }], [{ ...receipt, payloadHash: 'invalid' }]]) {
    await expect(applyMobileServiceCommands({ client: client(data).database, identity, request: { version: 2, commands: [first] } })).rejects.toMatchObject({ status: 503 });
  }
  await expect(applyMobileServiceCommands({ client: client([serviceApplied(second), receipt]).database, identity, request: { version: 2, commands: [first, second] } })).rejects.toMatchObject({ status: 503 });
});
it('keeps submitted requests separate from order writes and validates the actual request identity', async () => {
  const command: MobileServiceCommand = { ...serviceOrder(), type: 'service.order.request', reason: 'Improve timing' };
  const receipt = serviceApplied(command); const result = await applyMobileServiceCommands({ client: client([receipt]).database, identity, request: { version: 2, commands: [command] } });
  expect(result.results[0]).toMatchObject({ outcome: { kind: 'request' } });
  await expect(applyMobileServiceCommands({ client: client([serviceApplied(serviceOrder())]).database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
});
it.each([['42501',403],['40001',409],['40P01',409],['22023',400],['23514',400],['PGRST202',503]] as const)('maps SQL %s to safe HTTP %s without private details', async (code, status) => {
  await expect(applyMobileServiceCommands({ client: client({ code, message: 'private database detail' }, 400).database, identity, request: { version: 2, commands: [serviceOrder()] } })).rejects.toMatchObject({ status });
});
