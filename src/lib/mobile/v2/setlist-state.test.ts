import { describe, expect, it } from 'vitest';
import { mobileSetlistEditorCacheSchema, mobileSetlistSnapshotSchema } from './setlist-state';
import { setlistEditorCache, setlistSnapshot, id } from './setlist-state-test-fixture';

describe('Setlist aggregate edit bases', () => {
  it('retains raw row values, slot metadata, revisions and linked-event state exactly', () => {
    const snapshot = setlistSnapshot();
    expect(mobileSetlistSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(snapshot.slots[0]).toMatchObject({ notes: '{"rehearsalNotes":"Keep rehearsal notes"}', slide_settings: { nested: { custom: true } }, sync_revision: 2 });
  });
  it.each(['id', 'position', 'parent', 'deleted'] as const)('rejects inconsistent active slot %s', kind => {
    const snapshot = setlistSnapshot();
    snapshot.slots.push({ ...snapshot.slots[0], id: id(41), song_order: 2 });
    if (kind === 'id') snapshot.slots[1].id = snapshot.slots[0].id;
    if (kind === 'position') snapshot.slots[1].song_order = 1;
    if (kind === 'parent') snapshot.slots[1].setlist_id = id(99);
    if (kind === 'deleted') snapshot.slots[1].deleted_at = '2026-10-17T00:00:00Z';
    expect(mobileSetlistSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
  it('permits repeated songs with distinct slot IDs and positions', () => {
    const snapshot = setlistSnapshot();
    snapshot.slots.push({ ...snapshot.slots[0], id: id(41), song_order: 2 });
    expect(mobileSetlistSnapshotSchema.parse(snapshot).slots).toHaveLength(2);
  });
  it('retains an unavailable linked event as unknown without inventing its revision', () => {
    const snapshot = setlistSnapshot(); snapshot.linkedEvent = null;
    expect(mobileSetlistSnapshotSchema.parse(snapshot).record.event_id).toBe(id(10));
    expect(mobileSetlistSnapshotSchema.safeParse({ ...snapshot, record: { ...snapshot.record, sync_revision: undefined } }).success).toBe(false);
  });
  it.each(['identity', 'event', 'deleted', 'duplicate', 'linked-option', 'unapproved-option'] as const)('rejects inconsistent editor cache %s', kind => {
    const cache = setlistEditorCache();
    if (kind === 'identity') cache.setlists[0].record.team_id = id(99);
    if (kind === 'event') cache.setlists[0].linkedEvent!.id = id(99);
    if (kind === 'deleted') cache.setlists[0].record.deleted_at = '2026-10-17T00:00:00Z';
    if (kind === 'duplicate') cache.setlists.push(setlistSnapshot());
    if (kind === 'linked-option') cache.availableEvents.push(cache.setlists[0].linkedEvent!);
    if (kind === 'unapproved-option') cache.availableEvents.push({ ...cache.setlists[0].linkedEvent!, id: id(99), approval_status: 'pending' });
    expect(mobileSetlistEditorCacheSchema.safeParse(cache).success).toBe(false);
  });
  it('keeps legacy caches readable without treating absent templates as a verified empty catalog', () => {
    const cache = mobileSetlistEditorCacheSchema.parse(setlistEditorCache());
    expect(cache.templates).toBeUndefined(); expect(cache.retainedSongs).toBeUndefined();
    expect(cache.tombstones).toBeUndefined();
    expect(mobileSetlistEditorCacheSchema.parse({ ...cache, templates: [], retainedSongs: [] }).templates).toEqual([]);
    expect(mobileSetlistEditorCacheSchema.parse({ ...cache, tombstones: [] }).tombstones).toEqual([]);
  });
  it.each(['active', 'duplicate', 'negative', 'unsafe'] as const)('rejects inconsistent deletion catalog %s', kind => {
    const cache = setlistEditorCache();
    const tombstone = { id: kind === 'active' ? cache.setlists[0].record.id : id(99), revision: kind === 'negative' ? -1 : kind === 'unsafe' ? Number.MAX_SAFE_INTEGER + 1 : 9 };
    expect(mobileSetlistEditorCacheSchema.safeParse({ ...cache, tombstones: kind === 'duplicate' ? [tombstone, tombstone] : [tombstone] }).success).toBe(false);
  });
  it('rejects wrong-team or duplicate templates and retained song labels that masquerade as active choices', () => {
    const cache = setlistEditorCache();
    const template = { id: id(50), team_id: id(99), name: 'Template', description: null, slots: [], created_by: null, created_at: null };
    expect(mobileSetlistEditorCacheSchema.safeParse({ ...cache, templates: [template] }).success).toBe(false);
    expect(mobileSetlistEditorCacheSchema.safeParse({ ...cache, templates: [{ ...template, team_id: cache.identity.teamId }, { ...template, team_id: cache.identity.teamId }] }).success).toBe(false);
    expect(mobileSetlistEditorCacheSchema.safeParse({ ...cache, retainedSongs: cache.songs }).success).toBe(false);
    expect(mobileSetlistEditorCacheSchema.safeParse({ ...cache, retainedSongs: [{ ...cache.songs[0], id: id(99) }] }).success).toBe(false);
  });
});
