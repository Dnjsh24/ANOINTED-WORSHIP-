// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { MobileApiError } from '@/lib/server/mobile/context';
import { songPurgeIdentity as identity, songPurgeRequest as input, songPurgeReceipt as receipt, songPurgeState } from '@/lib/mobile/v2/song-purge-test-fixture';
const mocks = vi.hoisted(() => ({ context: vi.fn(), state: vi.fn(), purge: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.context }));
vi.mock('@/lib/server/mobile/v2/song-purge', () => ({ readMobileSongPurgeState: mocks.state, purgeMobileSong: mocks.purge }));
import { POST } from './route';
import { GET } from './[songId]/state/route';
it('requires selected authentication, no query broadening, strict complete review and bounded body', async () => {
 const context = { params: Promise.resolve({ teamId: identity.teamId, songId: input.base.id }) };
 mocks.context.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.'));
 expect((await GET(new Request('https://example.test'), context)).status).toBe(401);
 mocks.context.mockResolvedValue({ client: {}, identity });
 expect((await GET(new Request('https://example.test?force=true'), context)).status).toBe(400);
 const post = (body: unknown) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
 expect((await POST(post({ ...input, force: true }), context)).status).toBe(400);
 expect((await POST(post({ ...input, base: { ...input.base, deletedAt: null } }), context)).status).toBe(400);
 expect((await POST(post({ ...input, impact: null }), context)).status).toBe(400);
 expect((await POST(post({ junk: 'x'.repeat(9000) }), context)).status).toBe(413);
 expect(mocks.purge).not.toHaveBeenCalled();
 mocks.purge.mockResolvedValue(receipt); expect((await POST(post(input), context)).status).toBe(200);
 mocks.state.mockResolvedValue(songPurgeState); expect((await GET(new Request('https://example.test'), context)).status).toBe(200);
});
