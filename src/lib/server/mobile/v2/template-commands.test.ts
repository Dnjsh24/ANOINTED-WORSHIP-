// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { templateCreateCommand, templateDeleteCommand, templateApplied, templateIdentity as identity, id } from '@/lib/mobile/v2/template-command-test-fixture';
import { applyMobileTemplateCommands } from './template-commands';

function client(data: unknown = [templateApplied()], status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://template-command.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(data, { status }); } } });
  return { database, calls };
}
it('binds the selected verified bearer scope to template RPC', async () => {
  const { database, calls } = client(); const command = templateCreateCommand();
  expect(await applyMobileTemplateCommands({ client: database, identity, request: { version: 2, commands: [command] } })).toEqual({ version: 2, identity, results: [templateApplied()] });
  expect(calls).toEqual([{ url: 'https://template-command.test/rest/v1/rpc/mobile_apply_template_commands', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: [command] } }]);
});
it('rejects foreign bases before database access', async () => {
  const { database, calls } = client(); const command = templateCreateCommand(); command.sourceBase.record.team_id = id(99); command.sourceBase.linkedEvent = null;
  await expect(applyMobileTemplateCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 400 });
  expect(calls).toEqual([]);
});
it('rejects missing, substituted, reordered, wrong-operation and malformed confirmations', async () => {
  const command = templateCreateCommand();
  for (const data of [[], [templateApplied(), templateApplied()], [{ ...templateApplied(), templateId: id(99) }],
    [templateApplied(templateDeleteCommand())], [{ ...templateApplied(), payloadHash: 'bad' }]]) {
    await expect(applyMobileTemplateCommands({ client: client(data).database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
  }
});
it.each([['42501', 403], ['PGRST301', 401], ['40001', 409], ['40P01', 409], ['22023', 400], ['22P02', 400], ['PGRST202', 503]] as const)('maps SQL %s to safe HTTP %s', async (code, status) => {
  const action = () => applyMobileTemplateCommands({ client: client({ code, message: 'private database detail' }, 400).database, identity,
    request: { version: 2, commands: [templateCreateCommand()] } });
  await expect(action()).rejects.toMatchObject({ status }); await expect(action()).rejects.not.toHaveProperty('message', 'private database detail');
});
