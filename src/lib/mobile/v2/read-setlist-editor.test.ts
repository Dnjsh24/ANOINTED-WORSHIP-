// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture, server, identity, id, type Row } from './event-read-test-fixture';
import { setlistSnapshot } from './setlist-state-test-fixture';
import { mobileSetlistEditorCacheSchema } from './setlist-state';
import { readSetlistEditorContext } from './read-setlist-editor';

function editorFixture(): Record<string, Row[]> {
  const data = fixture();
  const base = setlistSnapshot();
  data.setlists = [base.record, { ...base.record, id: id(21), name: 'Standalone', event_id: null }, { ...base.record, id: id(22), deleted_at: '2026-10-17T00:00:00Z' }];
  data.setlist_songs = [base.slots[0], { ...base.slots[0], id: id(41), setlist_id: id(21) }, { ...base.slots[0], id: id(42), song_id: id(32), song_order: 2 }];
  data.songs = [
    { id: id(30), team_id: identity.teamId, title: 'Holy', artist: 'Artist', original_key: 'C', bpm: 80, status: 'approved', deleted_at: null },
    { id: id(31), team_id: identity.teamId, title: 'Visible pending song', artist: 'Artist', original_key: 'D', bpm: null, status: 'pending', deleted_at: null },
    { id: id(32), team_id: identity.teamId, title: 'Retained deleted song', artist: 'Artist', original_key: 'G', bpm: 90, status: 'approved', deleted_at: '2026-10-17T00:00:00Z' },
    { id: id(33), team_id: identity.teamId, title: 'Unrelated deleted song', artist: 'Artist', original_key: 'G', bpm: 90, status: 'approved', deleted_at: '2026-10-17T00:00:00Z' },
  ];
  data.setlist_templates = [
    { id: id(50), team_id: identity.teamId, name: 'Older template', description: 'Keep all template values', slots: [{ label: 'Praise', tag: 'Fast', custom: { keep: true } }], created_by: identity.userId, created_at: null },
    { id: id(51), team_id: identity.teamId, name: 'Latest template', description: null, slots: [], created_by: null, created_at: '2026-10-17T00:00:00Z' },
  ];
  data.mobile_deleted_records = [22, 23, 24].map(value => ({ team_id: identity.teamId, entity_type: 'setlist', entity_id: id(value), revision: 9, actor_id: null }));
  return data;
}
const options = { identity, teamName: 'Test team', accessToken: 'verified-token', pageSize: 2 };

describe('Authenticated stable setlist editor reads', () => {
  it('reads every capped page, exact aggregate bases, metadata and website-equivalent choices', async () => {
    const { client, urls, authHeaders } = server(editorFixture(), { cap: 1 });
    const context = await readSetlistEditorContext({ ...options, client });
    expect(context.setlists).toHaveLength(2);
    expect(context.setlists[0]).toMatchObject({ record: { sync_revision: 7, presentation_settings: { custom: { layout: 'wide' } } },
      slots: [{ sync_revision: 2, notes: '{"rehearsalNotes":"Keep rehearsal notes"}', slide_settings: { nested: { custom: true } } }, { song_id: id(32) }] });
    expect(context.availableEvents.map(row => row.id)).toEqual([id(11)]);
    expect(context.songs.map(row => row.id)).toEqual([id(30), id(31)]);
    expect(context.retainedSongs?.map(row => row.id)).toEqual([id(32)]);
    expect(context.templates?.map(row => row.id)).toEqual([id(50), id(51)]);
    expect(context.tombstones).toEqual([22, 23, 24].map(value => ({ id: id(value), revision: 9 })));
    expect(urls.some(url => url.pathname.endsWith('/mobile_deleted_records') && url.searchParams.get('entity_id') === `gt.${id(24)}`)).toBe(true);
    expect(context.templates?.[0].slots).toEqual([{ label: 'Praise', tag: 'Fast', custom: { keep: true } }]);
    expect(context.identity).toMatchObject({ ...identity, teamName: 'Test team', role: 'owner' });
    expect(authHeaders).toEqual(['Bearer verified-token', 'Bearer verified-token']);
    expect(urls.some(url => url.pathname.endsWith('/setlists') && url.searchParams.get('id') === `gt.${id(21)}`)).toBe(true);
    expect(urls.filter(url => url.pathname.startsWith('/rest/')).every(url => !url.searchParams.has('offset') && !url.searchParams.get('select')?.includes('*'))).toBe(true);
    expect(mobileSetlistEditorCacheSchema.parse(JSON.parse(JSON.stringify(context)))).toEqual(context);
  });
  it('does not grant edit rights to an active read-only member', async () => {
    const { client } = server(editorFixture(), { role: 'member' });
    const context = await readSetlistEditorContext({ ...options, client });
    expect(context.identity.role).toBe('member');
    expect(context.identity.permissions).not.toContain('setlists.manage');
    expect(context.setlists).toHaveLength(2);
  });
  it('matches descending website template dates with undated rows first and stable ties', async () => {
    const data = editorFixture();
    data.setlist_templates.push({ ...data.setlist_templates[0], id: id(52) }, { ...data.setlist_templates[1], id: id(53), created_at: '2026-10-01T00:00:00Z' });
    const context = await readSetlistEditorContext({ ...options, client: server(data).client });
    expect(context.templates?.map(row => row.id)).toEqual([id(50), id(52), id(51), id(53)]);
  });
  it('preserves unknown linked-event state without inventing a snapshot or revision', async () => {
    const data = editorFixture(); data.events = data.events.filter(row => row.id !== id(10));
    const context = await readSetlistEditorContext({ ...options, client: server(data).client });
    expect(context.setlists[0]).toMatchObject({ record: { event_id: id(10), sync_revision: 7 }, linkedEvent: null });
  });
  it('supports a verified empty catalog without fallback records or templates', async () => {
    const data = editorFixture(); for (const key of ['setlists', 'setlist_songs', 'events', 'songs', 'setlist_templates', 'mobile_deleted_records']) data[key] = [];
    const context = await readSetlistEditorContext({ ...options, client: server(data).client });
    expect(context).toMatchObject({ setlists: [], availableEvents: [], songs: [], retainedSongs: [], templates: [], tombstones: [] });
  });
  it.each(['setlists', 'events', 'songs', 'setlist_templates', 'mobile_deleted_records'] as const)('rejects foreign %s records even if the server filter is ignored', async table => {
    const broken = server(editorFixture(), { mutate: (name, rows) => name === table ? rows.map(row => ({ ...row, team_id: id(99) })) : rows });
    await expect(readSetlistEditorContext({ ...options, client: broken.client })).rejects.toMatchObject({ status: 403 });
  });
  it.each(['parent', 'deleted', 'repeat'] as const)('rejects malformed song-slot %s responses', async kind => {
    const broken = server(editorFixture(), { mutate: (name, rows) => {
      if (name !== 'setlist_songs' || !rows.length) return rows;
      if (kind === 'repeat') return rows.map(row => ({ ...row, id: id(40) }));
      return rows.map(row => ({ ...row, ...(kind === 'parent' ? { setlist_id: id(99) } : { deleted_at: '2026-10-17T00:00:00Z' }) }));
    } });
    await expect(readSetlistEditorContext({ ...options, client: broken.client })).rejects.toThrow();
  });
  it.each(['setlists', 'setlist_songs', 'events', 'songs', 'setlist_templates', 'mobile_deleted_records'] as const)('fails closed on a partial %s outage', async failTable => {
    const broken = server(editorFixture(), { failTable });
    await expect(readSetlistEditorContext({ ...options, client: broken.client })).rejects.toMatchObject({ status: 503 });
  });
  it.each(['parent', 'slots', 'event', 'song', 'template', 'template-deletion', 'deletion', 'restore'] as const)('rejects concurrent %s changes during preparation', async change => {
    const data = editorFixture(); let changed = false;
    const transport = server(data, { onRequest: url => {
      if (changed || !url.pathname.endsWith('/setlist_songs')) return;
      changed = true;
      if (change === 'parent') data.setlists[0].sync_revision = 8;
      if (change === 'slots') { data.setlist_songs[0].band_notes = 'Concurrent edit'; data.setlists[0].sync_revision = 8; }
      if (change === 'event') data.events[1].approval_status = 'rejected';
      if (change === 'song') data.songs[0].deleted_at = '2026-10-17T00:00:00Z';
      if (change === 'template') data.setlist_templates[0].slots = [{ label: 'Different arrangement' }];
      if (change === 'template-deletion') data.setlist_templates = [];
      if (change === 'deletion') data.mobile_deleted_records[0].revision = 10;
      if (change === 'restore') { data.mobile_deleted_records.shift(); data.setlists[2].deleted_at = null; }
    } });
    await expect(readSetlistEditorContext({ ...options, client: transport.client })).rejects.toMatchObject({ status: 409 });
  });
  it.each(['actor', 'entity', 'revision', 'duplicate', 'active'] as const)('rejects inconsistent deletion %s without a partial cache', async kind => {
    const broken = server(editorFixture(), { mutate: (table, rows) => {
      if (table !== 'mobile_deleted_records' || !rows.length) return rows;
      if (kind === 'duplicate') return [rows[0], rows[0]];
      return rows.map(row => ({ ...row,
        ...(kind === 'actor' ? { actor_id: id(99) } : {}),
        ...(kind === 'entity' ? { entity_type: 'song' } : {}),
        ...(kind === 'revision' ? { revision: -1 } : {}),
        ...(kind === 'active' ? { entity_id: id(20) } : {}),
      }));
    } });
    await expect(readSetlistEditorContext({ ...options, client: broken.client })).rejects.toThrow();
  });
  it('does not include other-team or other-domain deletion rows in the catalog', async () => {
    const data = editorFixture();
    data.mobile_deleted_records.push({ ...data.mobile_deleted_records[0], team_id: id(99), entity_id: id(90) },
      { ...data.mobile_deleted_records[0], entity_type: 'song', entity_id: id(91) });
    const result = await readSetlistEditorContext({ ...options, client: server(data).client });
    expect(result.tombstones?.map(row => row.id)).toEqual([id(22), id(23), id(24)]);
  });
  it('retains soft deletions from before mobile tracking, merging the greatest known revision without downloading their slots', async () => {
    const data = editorFixture(); data.mobile_deleted_records[0].revision = 3;
    data.setlists.push({ ...data.setlists[2], id: id(25), sync_revision: 15 });
    data.setlist_songs.push({ ...data.setlist_songs[0], id: id(49), setlist_id: id(25) });
    const transport = server(data, { cap: 1 });
    const context = await readSetlistEditorContext({ ...options, client: transport.client });
    expect(context.tombstones).toEqual([{ id: id(22), revision: 7 }, { id: id(23), revision: 9 }, { id: id(24), revision: 9 }, { id: id(25), revision: 15 }]);
    expect(context.setlists).toHaveLength(2);
    for (const url of transport.urls.filter(url => url.pathname.endsWith('/setlist_songs'))) expect(url.searchParams.get('setlist_id')).not.toContain(id(25));
  });
  it('rejects identity, permission or private event changes without accepting a partial context', async () => {
    await expect(readSetlistEditorContext({ ...options, client: server(editorFixture(), { userId: id(99) }).client })).rejects.toMatchObject({ status: 401 });
    const changed = server(editorFixture(), { mutate: (name, rows, call) => name === 'team_members' && call >= 2 ? rows.map(row => ({ ...row, role: 'member' })) : rows });
    await expect(readSetlistEditorContext({ ...options, client: changed.client })).rejects.toMatchObject({ status: 409 });
    const data = editorFixture(); data.events[2].created_by = id(99);
    await expect(readSetlistEditorContext({ ...options, client: server(data, { role: 'member' }).client })).rejects.toMatchObject({ status: 403 });
  });
  it('refuses cancellation before any network read and during child paging', async () => {
    const cancelled = new AbortController(); cancelled.abort(); const early = server(editorFixture());
    await expect(readSetlistEditorContext({ ...options, client: early.client, signal: cancelled.signal })).rejects.toThrow();
    expect(early.urls).toEqual([]);
    const controller = new AbortController(); const during = server(editorFixture(), { onRequest: url => { if (url.pathname.endsWith('/setlist_songs')) controller.abort(); } });
    await expect(readSetlistEditorContext({ ...options, client: during.client, signal: controller.signal })).rejects.toThrow();
    expect(during.authHeaders).toHaveLength(1);
  });
  it.each([0, 501, 1.5])('rejects invalid page size %s without calling the transport', async pageSize => {
    const transport = server(editorFixture());
    await expect(readSetlistEditorContext({ ...options, pageSize, client: transport.client })).rejects.toThrow(/page size/);
    expect(transport.urls).toEqual([]);
  });
  it('bounds child query IDs and retains slots from every parent chunk', async () => {
    const data = editorFixture(); const base = setlistSnapshot();
    data.setlists = Array.from({ length: 53 }, (_, index) => ({ ...base.record, id: id(100 + index), event_id: null }));
    data.setlist_songs = data.setlists.map((row, index) => ({ ...base.slots[0], id: id(500 + index), setlist_id: row.id }));
    const transport = server(data, { cap: 7 });
    const context = await readSetlistEditorContext({ ...options, pageSize: 10, client: transport.client });
    expect(context.setlists).toHaveLength(53); expect(context.setlists.every(row => row.slots.length === 1)).toBe(true);
    for (const url of transport.urls.filter(url => url.pathname.endsWith('/setlist_songs'))) expect(url.searchParams.get('setlist_id')!.slice(4, -1).split(',').length).toBeLessThanOrEqual(50);
  });
});
