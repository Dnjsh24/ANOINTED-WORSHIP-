// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { profileAvatarIdentity as identity } from '@/lib/mobile/v2/profile-avatar-test-fixture';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileWoolyRecords } from './wooly-records';
const id = '99890000-0000-4000-8000-000000000020';
const request = { version: 2 as const, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, question: 'Find song Grace', today: '2026-10-23' };
function setup(results: object[][]) {
  const queries: { table: string; filters: [string, unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const filters: [string, unknown[]][] = []; queries.push({ table, filters });
    const result = { data: results.shift() ?? [], error: null };
    const query = { then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve),
      select: vi.fn(), eq: vi.fn(), is: vi.fn(), ilike: vi.fn(), order: vi.fn(), gte: vi.fn(), limit: vi.fn(), in: vi.fn(), abortSignal: vi.fn() };
    for (const method of ['select','eq','is','ilike','order','gte','limit','in','abortSignal'] as const) query[method].mockImplementation((...args: unknown[]) => { filters.push([method, args]); return query; });
    return query;
  }); return { client: { from } as unknown as SupabaseClient<Database>, from, queries };
}
beforeEach(() => { mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity); });
it('derives real song/event/setlist intents, pins team and validates current authority before and after', async () => {
  const song = setup([[{ id, title: 'Grace', original_key: 'D', bpm: 72 }]]);
  const response = await readMobileWoolyRecords({ ...song, identity, request }); expect(response.reply).toMatchObject({ kind: 'answer', text: expect.stringContaining('D; BPM 72') });
  expect(song.queries[0].filters).toContainEqual(['eq', ['team_id', identity.teamId]]); expect(song.queries[0].filters.some(([name]) => name === 'abortSignal')).toBe(true);
  const event = setup([[{ id, name: 'Service', event_date: '2026-10-23', starts_at: '09:00', location: null }]]);
  expect((await readMobileWoolyRecords({ ...event, identity, request: { ...request, question: 'next event' } })).reply.kind).toBe('answer');
  expect(event.queries[0].filters).toContainEqual(['eq', ['approval_status', 'approved']]);
  const setlist = setup([[{ id, name: 'Sunday', setlist_date: '2026-10-23' }]]);
  expect((await readMobileWoolyRecords({ ...setlist, identity, request: { ...request, question: 'find setlist Sunday' } })).reply.kind).toBe('answer');
  mocks.selected.mockReset(); mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue({ ...identity, permissions: ['team.manage'] });
  await expect(readMobileWoolyRecords({ ...setup([]), identity, request })).rejects.toMatchObject({ status: 403 });
});
it('rejects cross actor scope and keeps arbitrary record IDs team-filtered; handles dates/help without demo fallback', async () => {
  const db = setup([]); await expect(readMobileWoolyRecords({ ...db, identity, request: { ...request, userId: id } })).rejects.toMatchObject({ status: 403 }); expect(db.from).not.toHaveBeenCalled();
  const selected = setup([]); const response = await readMobileWoolyRecords({ ...selected, identity, request: { ...request, choice: { kind: 'record', id, intent: 'song-details' } } });
  expect(response.reply).toMatchObject({ text: expect.stringContaining('couldn’t find') }); expect(selected.queries[0].filters).toContainEqual(['eq', ['id', id]]); expect(selected.queries[0].filters).toContainEqual(['eq', ['team_id', identity.teamId]]);
  const help = setup([]); expect((await readMobileWoolyRecords({ ...help, identity, request: { ...request, question: 'how do I create a song?' } })).reply.kind).toBe('unavailable'); expect(help.from).not.toHaveBeenCalled();
  expect((await readMobileWoolyRecords({ ...setup([]), identity, request: { ...request, question: 'events on Friday' } })).reply).toMatchObject({ kind: 'clarification', choices: [] });
});
it('refuses a truncated 101-song setlist, bounds cancellation and rejects unsafe record output', async () => {
  const list = { id, name: 'Sunday', setlist_date: '2026-10-23' }; const slots = Array.from({ length: 101 }, (_, i) => ({ song_id: id, assigned_key: 'D', song_order: i }));
  const db = setup([[list], slots]); const input = { ...request, choice: { kind: 'record' as const, id, intent: 'setlist-songs' as const } };
  expect((await readMobileWoolyRecords({ ...db, identity, request: input })).reply).toMatchObject({ kind: 'unavailable', text: expect.stringContaining('more than 100') });
  expect(db.queries[1].filters).toContainEqual(['limit', [101]]); expect(db.from).toHaveBeenCalledTimes(2);
  const controller = new AbortController(); controller.abort(); await expect(readMobileWoolyRecords({ ...setup([]), identity, request, signal: controller.signal })).rejects.toThrow();
  await expect(readMobileWoolyRecords({ ...setup([[{ id: 'evil', title: 'Grace', original_key: 'D', bpm: 72 }]]), identity, request })).rejects.toMatchObject({ status: 503 });
});
it('bounds a stalled workspace verification by caller cancellation before any record query', async () => {
  mocks.selected.mockImplementationOnce(() => new Promise(() => undefined));
  const db = setup([]); const controller = new AbortController(); const pending = readMobileWoolyRecords({ ...db, identity, request, signal: controller.signal });
  controller.abort(new Error('Cancelled lookup')); await expect(pending).rejects.toThrow('Cancelled lookup'); expect(db.from).not.toHaveBeenCalled();
});
it('labels the native event-date cap and refuses setlist summaries missing referenced song titles', async () => {
  const event = { id, name: 'Service', event_date: '2026-10-23', starts_at: '09:00', location: null };
  const dated = await readMobileWoolyRecords({ ...setup([[event]]), identity, request: { ...request, question: 'events today' } });
  expect(dated.reply).toMatchObject({ kind: 'answer', text: expect.stringContaining('Showing up to five approved events.') });
  const list = { id, name: 'Sunday', setlist_date: '2026-10-23' };
  const missing = await readMobileWoolyRecords({ ...setup([[list], [{ song_id: id, assigned_key: 'D', song_order: 0 }], []]), identity,
    request: { ...request, choice: { kind: 'record', id, intent: 'setlist-songs' } } });
  expect(missing.reply).toEqual({ kind: 'unavailable', text: 'Some setlist songs are unavailable. Open the setlist to review its current song list.' });
});
