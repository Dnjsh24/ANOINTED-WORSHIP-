// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { setlistCreateCommand, setlistSaveCommand, id } from '@/lib/mobile/v2/setlist-command-test-fixture';
import { setlistReceiptIdentity as identity } from '@/lib/mobile/v2/setlist-result-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn(), review: vi.fn() }));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/server/mobile/v2/setlist-create-review', () => ({ readMobileSetlistCreateReview: mocks.review }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { POST, OPTIONS } from './route';

const body = { version: 2, requestId: id(300), command: setlistCreateCommand() };
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
function request(value: unknown = body, origin = 'capacitor://localhost') {
  return new Request(`https://website.test/api/mobile/v2/workspaces/${identity.teamId}/setlist-create-review`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
}
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: 'verified bearer client', identity }); mocks.review.mockResolvedValue({ reviewed: true }); });
it('requires fresh selected scope and returns native CORS and no-store on the read', async () => {
  const incoming = request(); const response = await POST(incoming, context);
  expect(response.status).toBe(200); expect(mocks.selected).toHaveBeenCalledWith(incoming, identity.teamId);
  expect(mocks.review).toHaveBeenCalledWith({ client: 'verified bearer client', identity, request: body });
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect((await OPTIONS(request())).status).toBe(204);
});
it.each([401, 403, 409, 429])('does not inspect receipts after selected-scope denial %s', async status => {
  mocks.selected.mockRejectedValue(new MobileApiError(status, 'scope_changed', 'Reopen the matching workspace.'));
  expect((await POST(request(), context)).status).toBe(status); expect(mocks.review).not.toHaveBeenCalled();
});
it('rejects foreign origins, oversized JSON, actor claims and update commands', async () => {
  expect((await POST(request(body, 'https://attacker.test'), context)).status).toBe(403); expect(mocks.selected).not.toHaveBeenCalled();
  expect((await POST(request({ ...body, padding: 'あ'.repeat(400_000) }), context)).status).toBe(413);
  for (const invalid of [{ ...body, actorId: id(99) }, { ...body, command: setlistSaveCommand() }, { ...body, requestId: 'unbound' }]) {
    expect((await POST(request(invalid), context)).status).toBe(400);
  }
  expect(mocks.review).not.toHaveBeenCalled();
});
it('preserves generic unavailable-review 409 without turning it into a workspace change', async () => {
  mocks.review.mockRejectedValue(new MobileApiError(409, 'review_unavailable', 'Keep the original saved work.'));
  const response = await POST(request(), context);
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ version: 2, error: { code: 'review_unavailable', message: 'Keep the original saved work.' } });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
