// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { rehearsalCache, rehearsalPlanCommand, rehearsalTaskCommand, rehearsalReadinessCommand, rehearsalApplied, identity, id } from '@/lib/mobile/v2/rehearsal-test-fixture';
import { applyMobileRehearsalCommands, readMobileRehearsalWorkspace } from './rehearsal';
function client(payload: unknown, status = 200) {
  const calls: unknown[] = [];
  const database = createClient<Database>('https://rehearsal.test', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(payload, { status }); },
  } });
  return { database, calls };
}
it('pins downloads and all three command kinds to the selected verified team and member', async () => {
  const download = client(rehearsalCache().workspace);
  expect(await readMobileRehearsalWorkspace({ client: download.database, identity, setlistId: id(20) })).toEqual(rehearsalCache());
  expect(download.calls).toEqual([{ url: 'https://rehearsal.test/rest/v1/rpc/mobile_read_rehearsal_workspace', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: id(20) } }]);
  for (const command of [rehearsalPlanCommand(), rehearsalTaskCommand(), rehearsalReadinessCommand()]) {
    const sender = client([rehearsalApplied(command)]);
    expect((await applyMobileRehearsalCommands({ client: sender.database, identity, request: { version: 2, commands: [command] } })).results).toEqual([rehearsalApplied(command)]);
    expect(sender.calls).toEqual([{ url: 'https://rehearsal.test/rest/v1/rpc/mobile_apply_rehearsal_commands', body: { p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: [command] } }]);
  }
});
it('rejects incomplete, foreign, changed-intent and reordered confirmations without reporting success', async () => {
  const command = rehearsalReadinessCommand(); const result = rehearsalApplied(command);
  for (const payload of [[], [result, result], [{ ...result, commandId: id(99) }], [{ ...result, type: 'rehearsal.plan.save' }],
    [{ ...result, status: 'applied', workspace: { ...rehearsalCache().workspace, readiness: [] } }]]) {
    await expect(applyMobileRehearsalCommands({ client: client(payload).database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
  }
  await expect(readMobileRehearsalWorkspace({ client: client({ ...rehearsalCache().workspace, teamId: id(99) }).database, identity, setlistId: id(20) })).rejects.toMatchObject({ status: 503 });
});
it.each([['42501', 403], ['PGRST301', 401], ['40001', 409], ['40P01', 409], ['22023', 400], ['22P02', 400], ['PGRST202', 503]] as const)('maps SQL %s without exposing private database detail', async (code, status) => {
  await expect(readMobileRehearsalWorkspace({ client: client({ code, message: 'private database detail' }, 400).database, identity, setlistId: id(20) })).rejects.toMatchObject({ status });
});
