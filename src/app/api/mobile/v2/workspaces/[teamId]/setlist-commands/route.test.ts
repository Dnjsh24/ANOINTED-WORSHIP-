// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { setlistSaveCommand, id } from '@/lib/mobile/v2/setlist-command-test-fixture';
import { setlistReceiptIdentity as identity } from '@/lib/mobile/v2/setlist-result-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/setlist-commands', () => ({ applyMobileSetlistCommands: mocks.apply }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST, OPTIONS } from './route';
const body = { version: 2, commands: [setlistSaveCommand()] };
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(value: unknown = body, origin = 'capacitor://localhost') {
  return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/setlist-commands`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer client', identity }); mocks.apply.mockResolvedValue({ version: 2, identity, results: [] }); });
it('requires selected authenticated scope and preserves no-store/native CORS', async () => {
  const incoming = request(); const response = await POST(incoming, context); expect(response.status).toBe(200);
  expect(mocks.selected).toHaveBeenCalledWith(incoming, identity.teamId); expect(mocks.apply).toHaveBeenCalledWith({ client: 'verified bearer client', identity, request: body });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409, 429])('cannot execute after selected-scope denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope_changed', 'Reopen matching workspace.'));
  expect((await POST(request(), context)).status).toBe(status); expect(mocks.apply).not.toHaveBeenCalled();
});
it('rejects foreign origins, oversized streamed UTF-8 JSON and actor or command spoofing before mutation', async () => {
  expect((await POST(request(body, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.selected).not.toHaveBeenCalled();
  expect((await POST(request({ ...body, padding: 'あ'.repeat(400_000) }), context)).status).toBe(413);
  expect((await POST(request({ ...body, actorId: id(99) }), context)).status).toBe(400);
  expect((await POST(request({ version: 2, commands: [{ ...body.commands[0], grantedPermission: true }] }), context)).status).toBe(400);
  expect(mocks.apply).not.toHaveBeenCalled();
});
