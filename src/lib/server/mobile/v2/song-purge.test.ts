// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { songPurgeIdentity as identity, songPurgeRequest as request, songPurgeReceipt as receipt, songPurgeState as state } from '@/lib/mobile/v2/song-purge-test-fixture';
import { mobileSongPurgeRequestSchema, assertMobileSongPurgeReceipt, assertMobileSongPurgeState } from '@/lib/mobile/v2/song-purge';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileSongPurgeState, purgeMobileSong } from './song-purge';
const probe = { version: 2, memberCreatedAt: request.memberCreatedAt, songId: null, current: null, impact: null, status: 'missing', fetchedAt: state.fetchedAt };
function setup(values: unknown[], error: { code: string } | null = null) { const rpc = vi.fn(() => { const result = { data: values.shift() ?? null, error }; return { then: <T>(resolve: (v: typeof result) => T) => Promise.resolve(result).then(resolve), abortSignal: vi.fn(() => Promise.resolve(result)) }; }); return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }; }
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('binds exact Trash incarnation, full impact and original nonce with strict response scopes', () => {
 expect(mobileSongPurgeRequestSchema.safeParse({ ...request, base: { ...request.base, deletedAt: null } }).success).toBe(false);
 expect(mobileSongPurgeRequestSchema.safeParse({ ...request, impact: { ...request.impact, counts: { songs: 1 } } }).success).toBe(false);
 expect(() => assertMobileSongPurgeReceipt(identity, { ...request, requestNonce: request.base.id }, receipt)).toThrow();
 expect(() => assertMobileSongPurgeReceipt(identity, request, { ...receipt, current: request.base })).toThrow();
 expect(() => assertMobileSongPurgeState(identity, request.base.id, { ...state, status: 'impact-too-large' })).toThrow();
 expect(() => assertMobileSongPurgeState(identity, request.base.id, { ...state, current: { ...state.current, snapshot: { ...request.base, teamId: identity.userId } } })).toThrow();
});
it('reads complete impact and checks authority/incarnation again after the read', async () => {
 const { identity: ignored, ...raw } = state; void ignored; const db = setup([raw, probe]);
 expect(await readMobileSongPurgeState({ ...db, identity, songId: request.base.id })).toEqual(state);
 expect(db.rpc).toHaveBeenLastCalledWith('mobile_read_song_purge_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_song_id: null });
 await expect(readMobileSongPurgeState({ ...setup([raw, { ...probe, memberCreatedAt: '2026-10-24T05:00:00Z' }]), identity, songId: request.base.id })).rejects.toMatchObject({ status: 403 });
});
it('keeps immutable successful proof without reading/replaying a replacement song', async () => {
 const db = setup([receipt, probe]); expect(await purgeMobileSong({ ...db, identity, request })).toEqual(receipt);
 expect(db.rpc).toHaveBeenCalledWith('mobile_purge_song', { p_request: request });
 expect(db.rpc).toHaveBeenCalledTimes(2);
});
it('rejects worship/member, explicit SQL denial, changed authority and unconfirmed outcomes', async () => {
 const db = setup([]); await expect(purgeMobileSong({ ...db, identity: { ...identity, role: 'worship_leader' }, request })).rejects.toMatchObject({ status: 403 }); expect(db.rpc).not.toHaveBeenCalled();
 await expect(purgeMobileSong({ ...setup([], { code: '42501' }), identity, request })).rejects.toMatchObject({ status: 403 });
 await expect(purgeMobileSong({ ...setup([], { code: '22023' }), identity, request })).rejects.toMatchObject({ status: 409 });
 await expect(purgeMobileSong({ ...setup([], { code: '08006' }), identity, request })).rejects.toMatchObject({ status: 503 });
 mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue({ ...identity, role: 'admin' });
 await expect(purgeMobileSong({ ...setup([receipt]), identity, request })).rejects.toMatchObject({ status: 403 });
});
