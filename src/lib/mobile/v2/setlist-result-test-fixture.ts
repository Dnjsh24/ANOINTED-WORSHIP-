import { prepareMobileSetlistSave, type MobileSetlistCommand } from './setlist-commands';
import { type MobileSetlistResult, type MobileSetlistDeleteReview } from './setlist-results';
import { setlistIdentity, setlistSnapshot, id } from './setlist-state-test-fixture';

export const setlistReceiptIdentity = { userId: setlistIdentity.userId, teamId: setlistIdentity.teamId, memberId: setlistIdentity.memberId };
export function setlistDeleteReview(): MobileSetlistDeleteReview {
  const snapshot = setlistSnapshot(); const sibling = structuredClone(snapshot);
  sibling.record.id = id(22); sibling.record.sync_revision = 4;
  sibling.slots = sibling.slots.map(slot => ({ ...slot, id: id(42), setlist_id: id(22) }));
  return { snapshot, cascade: { deleteLinkedEvent: true, unlinkSetlists: [{ id: id(22), revision: 4 }] }, siblings: [sibling] };
}
export function setlistApplied(command: MobileSetlistCommand): Extract<MobileSetlistResult, { status: 'applied' }> {
  const common = { commandId: command.commandId, setlistId: command.setlistId, type: command.type, payloadHash: 'a'.repeat(64), status: 'applied' as const };
  if (command.type === 'setlist.delete') {
    const unlinked = setlistDeleteReview().siblings.map(row => ({ ...row, record: { ...row.record, event_id: null, sync_revision: 5 }, linkedEvent: null }));
    return { ...common, outcome: { kind: 'deleted', setlist: { id: command.setlistId, revision: command.baseRevision + 2, deleted: true },
      event: command.baseValue.linkedEvent ? { id: command.baseValue.linkedEvent.id, revision: command.baseValue.linkedEvent.sync_revision + 1, deleted: true } : null,
      unlinkedSetlists: command.cascade.unlinkSetlists.length ? unlinked : [] } };
  }
  const prepared = prepareMobileSetlistSave(command); const snapshot = structuredClone(command.baseValue ?? setlistSnapshot());
  snapshot.record = { ...snapshot.record, id: command.setlistId, name: prepared.details.name, setlist_date: prepared.details.setlist_date,
    team_id: setlistReceiptIdentity.teamId, event_id: prepared.eventId, location: prepared.details.location, call_time: prepared.details.call_time + ':00',
    rehearsal_time: prepared.details.rehearsal_time + ':00', service_times: prepared.details.service_times, notes: prepared.details.notes,
    leader_member_id: prepared.details.leader_member_id !== undefined ? prepared.details.leader_member_id : command.baseValue?.record.leader_member_id ?? null,
    presentation_settings: command.baseValue ? command.baseValue.record.presentation_settings : {}, sync_revision: command.baseRevision + 3,
    created_by: command.baseValue?.record.created_by ?? setlistReceiptIdentity.userId, deleted_at: null };
  snapshot.linkedEvent = command.linkedEventBase;
  const original = new Map(command.baseValue?.slots.map(slot => [slot.id, slot]) ?? []);
  const placeholders = command.template?.placeholders ?? [];
  const slotDefault = setlistSnapshot().slots[0];
  snapshot.slots = [
    ...placeholders.map((slot, index) => ({ ...slotDefault, id: slot.slotId, setlist_id: command.setlistId, song_id: slot.songId, song_order: index + 1,
      assigned_key: 'C', notes: 'Template Tag: none', band_notes: null, arrangement: null, lead_member_id: null, youtube_url: null, slide_settings: null, sync_revision: 1 })),
    ...prepared.slots.map((slot, index) => ({ ...original.get(slot.sourceSlotId ?? '') ?? slotDefault, id: slot.sourceSlotId ?? slot.localId,
      setlist_id: command.setlistId, song_id: slot.songId, song_order: placeholders.length + index + 1, assigned_key: slot.assignedKey,
      notes: slot.notes, band_notes: slot.bandNotes, arrangement: slot.arrangement, lead_member_id: slot.leadMemberId, youtube_url: slot.youtubeUrl,
      slide_settings: slot.slideSettings, sync_revision: (original.get(slot.sourceSlotId ?? '')?.sync_revision ?? 0) + 2 })),
  ];
  return { ...common, outcome: { kind: 'saved', snapshot, placeholders: placeholders.map((slot, index) => ({ index, ...slot })) } };
}
