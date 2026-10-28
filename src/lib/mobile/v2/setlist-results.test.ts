// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertMobileSetlistResult, mobileSetlistDeleteReviewSchema, setlistConflictValues } from './setlist-results';
import { setlistApplied, setlistDeleteReview, setlistReceiptIdentity as identity } from './setlist-result-test-fixture';
import { setlistSaveCommand, setlistCreateCommand, setlistDeleteCommand, id } from './setlist-command-test-fixture';

describe('setlist operation acknowledgements', () => {
  it('confirms exact create/update/delete operations and keeps normalization separate from originals', () => {
    for (const command of [setlistSaveCommand(), setlistCreateCommand(), setlistDeleteCommand()]) {
      const result = setlistApplied(command); expect(assertMobileSetlistResult(command, identity, result)).toEqual(result);
    }
    const command = setlistSaveCommand(); command.value.slots[0].assignedKey = '  D  ';
    expect(assertMobileSetlistResult(command, identity, setlistApplied(command))).toMatchObject({ status: 'applied' });
    expect(command.value.slots[0].assignedKey).toBe('  D  ');
  });
  it.each(['command', 'setlist', 'team', 'type', 'hash', 'unknown'] as const)('rejects substituted acknowledgement %s', change => {
    const command = setlistSaveCommand(); const result = setlistApplied(command);
    if (change === 'command') result.commandId = id(99);
    if (change === 'setlist') result.setlistId = id(99);
    if (change === 'type') result.type = 'setlist.delete';
    if (change === 'hash') result.payloadHash = 'invalid';
    if (result.outcome.kind !== 'saved') throw Error('fixture');
    if (change === 'team') result.outcome.snapshot.record.team_id = id(99);
    expect(() => assertMobileSetlistResult(command, identity, change === 'unknown' ? { ...result, grantedPermission: true } : result)).toThrow();
  });
  it.each(['name', 'date', 'location', 'clock', 'rehearsal', 'service', 'notes', 'leader', 'presentation', 'creator', 'created', 'revision', 'deleted', 'event'] as const)('checks saved parent intent and immutable %s', change => {
    const command = setlistSaveCommand(); const result = setlistApplied(command); if (result.outcome.kind !== 'saved') throw Error('fixture');
    const record = result.outcome.snapshot.record;
    if (change === 'name') record.name = 'Wrong name'; if (change === 'date') record.setlist_date = '2026-10-19';
    if (change === 'location') record.location = 'Other room'; if (change === 'clock') record.call_time = '10:00:00';
    if (change === 'rehearsal') record.rehearsal_time = null; if (change === 'service') record.service_times = [];
    if (change === 'notes') record.notes = null; if (change === 'leader') record.leader_member_id = id(99);
    if (change === 'presentation') record.presentation_settings = null; if (change === 'creator') record.created_by = id(99);
    if (change === 'created') record.created_at = '2025-01-01T00:00:00Z'; if (change === 'revision') record.sync_revision = command.baseRevision;
    if (change === 'deleted') record.deleted_at = '2026-10-18T00:00:00Z'; if (change === 'event') { record.event_id = null; result.outcome.snapshot.linkedEvent = null; }
    expect(() => assertMobileSetlistResult(command, identity, result)).toThrow();
  });
  it.each(['id', 'song', 'order', 'key', 'notes', 'band', 'arrangement', 'lead', 'url', 'layout', 'revision', 'created', 'extra', 'missing'] as const)('checks each saved song occurrence and its %s', change => {
    const command = setlistSaveCommand(); const result = setlistApplied(command); if (result.outcome.kind !== 'saved') throw Error('fixture');
    const slot = result.outcome.snapshot.slots[0];
    if (change === 'id') slot.id = id(99); if (change === 'song') slot.song_id = id(99); if (change === 'order') slot.song_order = 2;
    if (change === 'key') slot.assigned_key = 'D'; if (change === 'notes') slot.notes = null; if (change === 'band') slot.band_notes = null;
    if (change === 'arrangement') slot.arrangement = null; if (change === 'lead') slot.lead_member_id = null; if (change === 'url') slot.youtube_url = null;
    if (change === 'layout') slot.slide_settings = null; if (change === 'revision') slot.sync_revision = command.baseValue!.slots[0].sync_revision;
    if (change === 'created') slot.created_at = '2025-01-01T00:00:00Z'; if (change === 'missing') result.outcome.snapshot.slots = [];
    if (change === 'extra') result.outcome.snapshot.slots.push({ ...slot, id: id(41), song_order: 2 });
    expect(() => assertMobileSetlistResult(command, identity, result)).toThrow();
  });
  it('accepts equivalent typed clocks/timestamps and unchanged legacy metadata without rewriting the saved base', () => {
    const command = setlistSaveCommand(); command.baseValue!.slots[0].notes = command.value.slots[0].notes = 'x'.repeat(2100);
    const original = structuredClone(command); const result = setlistApplied(command); if (result.outcome.kind !== 'saved') throw Error('fixture');
    result.outcome.snapshot.record.call_time = '09:00'; result.outcome.snapshot.record.created_at = command.baseValue!.record.created_at.replace('Z', '+00:00');
    result.outcome.snapshot.slots[0].created_at = command.baseValue!.slots[0].created_at.replace('Z', '+00:00');
    expect(assertMobileSetlistResult(command, identity, result)).toEqual(result); expect(command).toEqual(original);
  });
  it('uses the actual website empty-object presentation default on create and preserves an existing explicit null on update', () => {
    const create = setlistCreateCommand(); const result = setlistApplied(create); if (result.outcome.kind !== 'saved') throw Error('fixture');
    expect(result.outcome.snapshot.record.presentation_settings).toEqual({});
    expect(assertMobileSetlistResult(create, identity, result)).toEqual(result);
    result.outcome.snapshot.record.presentation_settings = null;
    expect(() => assertMobileSetlistResult(create, identity, result)).toThrow();
    const update = setlistSaveCommand(); update.baseValue!.record.presentation_settings = null;
    expect(assertMobileSetlistResult(update, identity, setlistApplied(update))).toMatchObject({ status: 'applied' });
  });
  it('requires every exact template position and stable placeholder mapping without matching duplicate labels by song name', () => {
    const command = setlistCreateCommand(); command.template = { base: { id: id(50), team_id: identity.teamId, name: 'Template', description: null,
      slots: [{ label: 'Same label' }, { label: 'Same label' }], created_by: null, created_at: null }, placeholders: [{ slotId: id(60), songId: id(61) }, { slotId: id(62), songId: id(63) }] };
    const result = setlistApplied(command); expect(assertMobileSetlistResult(command, identity, result)).toEqual(result);
    for (const change of ['mapping', 'index', 'slot', 'song', 'metadata', 'notes', 'missing'] as const) {
      const modified = structuredClone(result); if (modified.outcome.kind !== 'saved') throw Error('fixture');
      if (change === 'mapping') modified.outcome.placeholders[1] = modified.outcome.placeholders[0];
      if (change === 'index') modified.outcome.placeholders[0].index = 1;
      if (change === 'slot') modified.outcome.snapshot.slots[0].id = id(99);
      if (change === 'song') modified.outcome.snapshot.slots[0].song_id = id(99);
      if (change === 'metadata') modified.outcome.snapshot.slots[0].band_notes = 'Unexpected cue';
      if (change === 'notes') modified.outcome.snapshot.slots[0].notes = null;
      if (change === 'missing') modified.outcome.placeholders = [];
      expect(() => assertMobileSetlistResult(command, identity, modified)).toThrow();
    }
  });
  it.each(['target', 'target-revision', 'event', 'event-revision', 'sibling', 'sibling-revision', 'sibling-team', 'sibling-link', 'missing', 'duplicate'] as const)('requires actual deletion/sibling confirmation: %s', change => {
    const command = setlistDeleteCommand(); const result = setlistApplied(command); if (result.outcome.kind !== 'deleted') throw Error('fixture');
    const saved = result.outcome;
    if (change === 'target') saved.setlist.id = id(99); if (change === 'target-revision') saved.setlist.revision = command.baseRevision;
    if (change === 'event') saved.event = null; if (change === 'event-revision') saved.event!.revision = command.baseValue.linkedEvent!.sync_revision;
    if (change === 'sibling') saved.unlinkedSetlists[0].record.id = id(99); if (change === 'sibling-revision') saved.unlinkedSetlists[0].record.sync_revision = 4;
    if (change === 'sibling-team') saved.unlinkedSetlists[0].record.team_id = id(99);
    if (change === 'sibling-link') saved.unlinkedSetlists[0].record.event_id = id(10);
    if (change === 'missing') saved.unlinkedSetlists = []; if (change === 'duplicate') saved.unlinkedSetlists.push(saved.unlinkedSetlists[0]);
    expect(() => assertMobileSetlistResult(command, identity, result)).toThrow();
  });
  it('preserves complete base/local conflict intent and rejects foreign or unrelated current values', () => {
    for (const command of [setlistSaveCommand(), setlistDeleteCommand()]) {
      const result = { commandId: command.commandId, setlistId: command.setlistId, type: command.type, status: 'conflict', payloadHash: 'b'.repeat(64),
        ...setlistConflictValues(command), remote: { snapshot: command.baseValue, template: null, deleteReview: command.type === 'setlist.delete' ? setlistDeleteReview() : null } };
      expect(assertMobileSetlistResult(command, identity, result)).toEqual(result);
      expect(() => assertMobileSetlistResult(command, identity, { ...result, baseValue: null })).toThrow();
      expect(() => assertMobileSetlistResult(command, identity, { ...result, localValue: {} })).toThrow();
      const foreign = structuredClone(result); foreign.remote.snapshot!.record.team_id = id(99);
      expect(() => assertMobileSetlistResult(command, identity, foreign)).toThrow();
      expect(() => assertMobileSetlistResult(command, identity, { ...result, remote: { ...result.remote, template: { id: id(50), team_id: identity.teamId, name: 'Wrong template', slots: [], description: null, created_by: null, created_at: null } } })).toThrow();
    }
  });
  it('accepts bounded rejection/dependency outcomes without inventing an applied snapshot', () => {
    const command = setlistSaveCommand(); const common = { commandId: command.commandId, setlistId: command.setlistId, type: command.type, payloadHash: 'c'.repeat(64) };
    for (const result of [{ ...common, status: 'rejected', code: 'unavailable', message: 'Keep draft' }, { ...common, status: 'blocked', code: 'dependency', message: 'Wait for earlier change' }]) {
      expect(assertMobileSetlistResult(command, identity, result)).toEqual(result);
    }
    expect(() => assertMobileSetlistResult(command, { ...identity, teamId: id(99) }, { ...common, status: 'rejected', code: 'unavailable', message: 'Keep draft' })).toThrow();
  });
});

describe('complete deletion review', () => {
  it('includes and retains a soft-deleted sibling in the reviewed scope', () => {
    const review = setlistDeleteReview(); review.siblings[0].record.deleted_at = '2026-10-18T00:00:00Z';
    expect(mobileSetlistDeleteReviewSchema.parse(review)).toEqual(review);
  });
  it.each(['missing', 'duplicate', 'revision', 'team', 'parent', 'event', 'consent', 'unknown-event'] as const)('rejects incomplete or inconsistent %s scope', change => {
    const review = setlistDeleteReview();
    if (change === 'missing') review.siblings = []; if (change === 'duplicate') review.siblings.push(review.siblings[0]);
    if (change === 'revision') review.cascade.unlinkSetlists[0].revision++;
    if (change === 'team') review.siblings[0].record.team_id = id(99);
    if (change === 'parent') review.siblings[0].record.id = review.snapshot.record.id;
    if (change === 'event') { review.siblings[0].record.event_id = null; review.siblings[0].linkedEvent = null; }
    if (change === 'consent') review.cascade.deleteLinkedEvent = false; if (change === 'unknown-event') review.snapshot.linkedEvent = null;
    expect(mobileSetlistDeleteReviewSchema.safeParse(review).success).toBe(false);
  });
});
