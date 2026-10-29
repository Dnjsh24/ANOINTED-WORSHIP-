// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { songEditorContext as fixture, songEditorId as id } from '@/lib/mobile/v2/song-editor-test-fixture';
import { assertMobileSongEditorBase, mobileSongEditorContextSchema } from '@/lib/mobile/v2/song-editor';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({})); vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileSongEditorContext } from './song-editor';
const songRow = { id: fixture.song.id, team_id: fixture.song.teamId, created_by: fixture.song.createdBy, created_at: fixture.song.createdAt, sync_revision: fixture.song.revision, status: 'approved', deleted_at: null, ...fixture.song.value };
const identity = fixture.identity;
const override = (allowed: boolean, person = true) => ({ id: id(person ? 10 : 11), team_id: identity.teamId, role: person ? null : 'member', member_id: person ? identity.memberId : null, permission: 'songs.edit', allowed });
function setup(options: { song?: unknown; changedSong?: unknown; pages?: unknown[][]; error?: string } = {}) {
 let songReads = 0; const calls: unknown[] = [], pages = [...(options.pages ?? [[], []])];
 const from = vi.fn((table: string) => { const response = () => ({ data: table === 'songs' ? songReads++ > 0 && options.changedSong !== undefined ? options.changedSong : options.song === undefined ? songRow : options.song : pages.shift() ?? [], error: options.error ? { code: options.error } : null });
  const query = { select: vi.fn(() => query), eq: vi.fn((...args: unknown[]) => { calls.push([table, 'eq', ...args]); return query; }), is: vi.fn(() => query), or: vi.fn(() => query), order: vi.fn(() => query), gt: vi.fn((...args: unknown[]) => { calls.push([table, 'gt', ...args]); return query; }), limit: vi.fn(() => query), abortSignal: vi.fn(() => query), maybeSingle: () => Promise.resolve(response()), then: <T>(resolve: (v: ReturnType<typeof response>) => T) => Promise.resolve(response()).then(resolve) }; return query; });
 return { context: { client: { from } as unknown as SupabaseClient<Database>, identity, songId: fixture.song.id }, calls, from };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('allows actual creator without general edit permission and keeps confirmed metadata outside mutable song value', async () => {
 const { context } = setup(); const result = await readMobileSongEditorContext(context);
 expect(result.song).toEqual(fixture.song); expect(result.authorization).toEqual({ direct: true, propose: false, editOverride: null });
 expect(() => assertMobileSongEditorBase(identity, { entityType: 'song', id: result.song.id, revision: 3, value: result.song.value }, result)).not.toThrow();
 expect(() => assertMobileSongEditorBase(identity, { entityType: 'song', id: result.song.id, revision: 2, value: result.song.value }, result)).toThrow();
 expect(mobileSongEditorContextSchema.safeParse({ ...result, authorization: { direct: false, propose: true, editOverride: null } }).success).toBe(false);
});
it('reads short pages until empty and distinguishes explicit deny from inherited absence, with person precedence', async () => {
 const person = override(false), role = override(true, false); const { context, calls } = setup({ pages: [[person], [role], [], [person], [role], []] });
 const result = await readMobileSongEditorContext(context); expect(result.authorization).toEqual({ direct: false, propose: true, editOverride: false });
 expect(calls).toContainEqual(['team_permission_overrides', 'gt', 'id', person.id]); expect(mocks.selected).toHaveBeenCalledTimes(2);
 const grant = override(true); expect((await readMobileSongEditorContext(setup({ song: { ...songRow, created_by: id(20) }, pages: [[grant], [], [grant], []] }).context)).authorization.direct).toBe(true);
});
it('uses actual noncreator/proposal and owner/admin defaults without substituting a missing or denied read', async () => {
 expect((await readMobileSongEditorContext(setup({ song: { ...songRow, created_by: id(20) } }).context)).authorization).toEqual({ direct: false, propose: true, editOverride: null });
 for (const role of ['owner', 'admin']) { const actor = { ...identity, role }; mocks.selected.mockResolvedValue(actor); expect((await readMobileSongEditorContext({ ...setup({ song: { ...songRow, created_by: id(20) } }).context, identity: actor })).authorization.direct).toBe(true); }
 mocks.selected.mockResolvedValue(identity);
 await expect(readMobileSongEditorContext(setup({ error: '42501' }).context)).rejects.toMatchObject({ status: 503 });
 await expect(readMobileSongEditorContext(setup({ song: null }).context)).rejects.toMatchObject({ status: 404 });
});
it('rejects scoped/ambiguous/changed overrides, changed song and revoked authority with no guessed context', async () => {
 await expect(readMobileSongEditorContext(setup({ song: { ...songRow, team_id: id(99) } }).context)).rejects.toMatchObject({ status: 503 });
 const foreign = { ...override(false), member_id: id(99) }; await expect(readMobileSongEditorContext(setup({ pages: [[foreign], []] }).context)).rejects.toMatchObject({ status: 503 });
 await expect(readMobileSongEditorContext(setup({ pages: [[override(false), { ...override(false), id: id(12) }], []] }).context)).rejects.toMatchObject({ status: 503 });
 await expect(readMobileSongEditorContext(setup({ pages: [[], [override(false)], []] }).context)).rejects.toMatchObject({ status: 409 });
 await expect(readMobileSongEditorContext(setup({ changedSong: { ...songRow, sync_revision: 4 } }).context)).rejects.toMatchObject({ status: 409 });
 mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue({ ...identity, memberId: id(99) }); await expect(readMobileSongEditorContext(setup().context)).rejects.toMatchObject({ status: 409 });
});
