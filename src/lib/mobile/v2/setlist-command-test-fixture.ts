import type { MobileSetlistCommand, MobileSetlistSaveCommand } from './setlist-commands';
import { id, setlistSnapshot, setlistIdentity } from './setlist-state-test-fixture';

export { id, setlistIdentity };
export function setlistSaveCommand(): MobileSetlistSaveCommand {
  const base = setlistSnapshot();
  return { commandId: id(80), setlistId: base.record.id, type: 'setlist.save', mode: 'update', baseRevision: base.record.sync_revision,
    baseValue: base, linkedEventBase: base.linkedEvent, template: null, dependsOn: [], value: {
      form: { title: 'Sunday', serviceDate: '2026-10-18', eventType: 'service', serviceType: 'Sunday Worship',
        location: 'Hall', callTime: '09:00', rehearsalTime: '08:00', notes: 'Original notes' },
      slots: base.slots.map(slot => ({ localId: id(90), sourceSlotId: slot.id, songId: slot.song_id, assignedKey: slot.assigned_key,
        notes: slot.notes, bandNotes: slot.band_notes, arrangement: slot.arrangement, leadMemberId: slot.lead_member_id,
        youtubeUrl: slot.youtube_url, slideSettings: slot.slide_settings })),
    } };
}
export function setlistCreateCommand(): MobileSetlistSaveCommand {
  const command = setlistSaveCommand();
  return { ...command, mode: 'create', baseValue: null, baseRevision: 0, setlistId: id(21), linkedEventBase: null,
    value: { ...command.value, slots: command.value.slots.map(slot => ({ ...slot, sourceSlotId: null })) } };
}
export function setlistDeleteCommand(): Extract<MobileSetlistCommand, { type: 'setlist.delete' }> {
  const base = setlistSnapshot();
  return { commandId: id(81), type: 'setlist.delete', setlistId: base.record.id, baseRevision: base.record.sync_revision,
    baseValue: base, dependsOn: [], cascade: { deleteLinkedEvent: true, unlinkSetlists: [{ id: id(22), revision: 4 }] } };
}
