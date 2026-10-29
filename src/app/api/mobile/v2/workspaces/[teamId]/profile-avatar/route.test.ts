// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { profileAvatarIdentity as identity, profileAvatarRequest as request, profileAvatarReceipt as receipt } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks = vi.hoisted(() => ({ context: vi.fn(), apply: vi.fn(), upload: vi.fn(), read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.context }));
vi.mock('@/lib/server/mobile/v2/profile-avatar', () => ({ applyMobileProfileAvatar: mocks.apply, uploadMobileProfileAvatar: mocks.upload, readMobileProfileAvatarState: mocks.read }));
import { POST as finalize } from './finalize/route';
import { POST as upload } from './upload/route';
import { GET } from './state/route';
const context = { params: Promise.resolve({ teamId: identity.teamId }) };
const post = (body: unknown) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ client: {}, identity }); mocks.apply.mockResolvedValue(receipt); mocks.upload.mockResolvedValue({ version: 2, request, uploaded: true }); mocks.read.mockResolvedValue({ version: 2 }); });
it('keeps authenticated workspace, strict query and bounded JSON upload/finalization boundaries', async () => {
  expect((await finalize(post(request), context)).status).toBe(200);
  expect((await upload(post({ request, base64: 'iVBORw0KGgo=' }), context)).status).toBe(200);
  expect((await upload(post({ request, base64: 'iVBORw0KGgo=', extra: true }), context)).status).toBe(400);
  expect((await GET(new Request('https://example.test?url=https://evil.test/photo'), context)).status).toBe(400);
  expect((await finalize(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(32769) }), context)).status).toBe(413);
  expect(mocks.apply).toHaveBeenCalledOnce(); expect(mocks.upload).toHaveBeenCalledOnce();
});
