// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { MobileApiError } from '@/lib/server/mobile/context';
import { songEditorContext as editor, songProposalIntent as intent, songProposalReceipt as receipt } from '@/lib/mobile/v2/song-editor-test-fixture';
const mocks = vi.hoisted(() => ({ context: vi.fn(), editor: vi.fn(), submit: vi.fn(), status: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async original => ({ ...await original<typeof import('@/lib/server/mobile/v2/context')>(), requireSelectedWorkspace: mocks.context }));
vi.mock('@/lib/server/mobile/v2/song-editor', () => ({ readMobileSongEditorContext: mocks.editor }));
vi.mock('@/lib/server/mobile/v2/song-proposals', () => ({ submitMobileSongProposal: mocks.submit, readMobileSongProposalStatus: mocks.status }));
import { GET, POST } from './route';
import { GET as editorGet } from '../../song-editor/[songId]/route';
it('binds selected auth, exact target/nonce query and bounded strict proposal without publishing flags', async () => {
 const context = { params: Promise.resolve({ teamId: editor.identity.teamId, songId: editor.song.id }) }, base = 'https://example.test';
 mocks.context.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.')); expect((await GET(new Request(base), context)).status).toBe(401);
 mocks.context.mockResolvedValue({ client: {}, identity: editor.identity }); mocks.editor.mockResolvedValue(editor);
 expect((await GET(new Request(base + '?force=true'), context)).status).toBe(400);
 expect((await GET(new Request(base + '?requestNonce=' + intent.proposal.requestNonce + '&requestNonce=' + intent.proposal.requestNonce), context)).status).toBe(400);
 expect((await editorGet(new Request(base + '?requestNonce=' + intent.proposal.requestNonce), context)).status).toBe(400);
 const post = (body: unknown) => new Request(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
 for (const body of [{ version: 2, intent, publish: true }, { version: 2, intent: { ...intent, proposal: { ...intent.proposal, changes: { created_by: editor.identity.userId } } } }]) expect((await POST(post(body), context)).status).toBe(400);
 expect((await POST(post({ padding: 'a'.repeat(140000) }), context)).status).toBe(413); expect(mocks.submit).not.toHaveBeenCalled();
 mocks.submit.mockResolvedValue(receipt); expect((await POST(post({ version: 2, intent }), context)).status).toBe(200);
 expect((await GET(new Request(base), context)).status).toBe(200);
 mocks.status.mockResolvedValue({ version: 2, identity: editor.identity, songId: editor.song.id, requestNonce: intent.proposal.requestNonce, receipt, fetchedAt: editor.fetchedAt });
 expect((await GET(new Request(base + '?requestNonce=' + intent.proposal.requestNonce), context)).status).toBe(200);
 expect(mocks.status).toHaveBeenCalledWith(expect.objectContaining({ songId: editor.song.id, requestNonce: intent.proposal.requestNonce }));
});
