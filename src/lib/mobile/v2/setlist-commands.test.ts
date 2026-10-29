// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSetlistDetails } from '@/lib/domain/event-workflows';
import { normalizeSetlistServiceTimes } from '@/lib/domain/event-types';
import { mobileSetlistCommandSchema, mobileSetlistCommandsRequestSchema, assertMobileSetlistCommandScope, prepareMobileSetlistSave } from './setlist-commands';
import { mobileSetlistFormSchema } from './setlist-command-fields';
import { setlistSaveCommand, setlistCreateCommand, setlistDeleteCommand, id, setlistIdentity } from './setlist-command-test-fixture';

describe('full setlist intent contract', () => {
  it('reuses website form validation, normalization and details without creating or editing Timeline events', () => {
    const command = setlistSaveCommand();
    command.value.form = { ...command.value.form, title: '  Sunday  ', serviceType: '  Sunday Worship  ', notes: '  Notes  ' };
    const parsed = mobileSetlistCommandSchema.parse(command);
    expect(parsed).toMatchObject({ value: { form: { title: 'Sunday', serviceType: 'Sunday Worship', notes: 'Notes' } } });
    const form = mobileSetlistFormSchema.parse(command.value.form);
    expect(prepareMobileSetlistSave(command).details).toEqual({ ...buildSetlistDetails(form, normalizeSetlistServiceTimes(form.eventType, form.serviceType)), update_event: false });
    expect(prepareMobileSetlistSave(command)).toMatchObject({ eventId: command.baseValue!.record.event_id });
    expect(prepareMobileSetlistSave(command).details).not.toHaveProperty('leader_member_id');
    expect(prepareMobileSetlistSave({ ...command, value: { ...command.value, form: { ...form, worshipLeader: '' } } }).details).toHaveProperty('leader_member_id', null);
    expect(prepareMobileSetlistSave({ ...command, value: { ...command.value, form: { ...form, eventType: 'meeting', serviceType: undefined } } }).details.service_times).toEqual([]);
  });

  it.each([{ title: '' }, { title: 'x'.repeat(161) }, { serviceDate: '2026-02-30' }, { eventType: 'unknown' },
    { serviceType: '' }, { location: '' }, { callTime: '25:00' }, { rehearsalTime: '08:71' }, { notes: 'x'.repeat(2001) },
    { worshipLeader: 'not-a-member-id' }, { eventId: 'unknown-event' }, { teamId: id(99) }, { approval: 'approved' }])('rejects invalid website form values %j', change => {
    expect(mobileSetlistFormSchema.safeParse({ ...setlistSaveCommand().value.form, ...change }).success).toBe(false);
  });

  it('retains full immutable original parent, presentation and per-slot data without mutating the caller', () => {
    const command = setlistSaveCommand(); const before = structuredClone(command);
    expect(mobileSetlistCommandSchema.parse(command)).toEqual(command);
    expect(prepareMobileSetlistSave(command).slots).toEqual(command.value.slots);
    expect(command).toEqual(before);
    expect(command.baseValue!.record.presentation_settings).toMatchObject({ custom: { layout: 'wide' } });
    expect(command.value.slots[0].notes).toContain('rehearsalNotes');
  });

  it.each(['missing', 'revision', 'id', 'deleted', 'create-revision', 'create-base'] as const)('rejects an inconsistent saved base: %s', change => {
    let command = setlistSaveCommand();
    if (change === 'missing') command.baseValue = null;
    if (change === 'revision') command.baseRevision++;
    if (change === 'id') command.setlistId = id(99);
    if (change === 'deleted') command.baseValue!.record.deleted_at = '2026-10-18T00:00:00Z';
    if (change === 'create-revision') command = { ...setlistCreateCommand(), baseRevision: 7 };
    if (change === 'create-base') command.mode = 'create';
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
  });

  it('keeps repeated songs distinct, allows explicit removal, and preserves retained slot identities through reordering', () => {
    const command = setlistSaveCommand(); const baseSlot = command.baseValue!.slots[0];
    command.baseValue!.slots.push({ ...baseSlot, id: id(41), song_order: 2, notes: 'Second occurrence' });
    command.value.slots.unshift({ ...command.value.slots[0], localId: id(91), sourceSlotId: id(41), notes: 'Second occurrence' });
    expect(prepareMobileSetlistSave(command).slots.map(slot => slot.sourceSlotId)).toEqual([id(41), id(40)]);
    command.value.slots = command.value.slots.slice(0, 1);
    expect(prepareMobileSetlistSave(command).slots).toHaveLength(1);
    command.value.slots = [];
    expect(prepareMobileSetlistSave(command).slots).toEqual([]);
    expect(command.baseValue!.slots).toHaveLength(2);
  });

  it.each(['source', 'song', 'local', 'reuse-removed', 'unknown-source', 'command-id', 'setlist-id'] as const)('rejects ambiguous or retargeted slot identity: %s', change => {
    const command = setlistSaveCommand(); const slot = { ...command.value.slots[0], localId: id(91), sourceSlotId: null as string | null };
    if (change === 'source') slot.sourceSlotId = id(40);
    if (change === 'song') { command.value.slots[0].songId = id(99); }
    if (change === 'local') slot.localId = id(90);
    if (change === 'reuse-removed') { slot.localId = id(40); command.value.slots = []; }
    if (change === 'unknown-source') slot.sourceSlotId = id(99);
    if (change === 'command-id') slot.localId = command.commandId;
    if (change === 'setlist-id') slot.localId = command.setlistId;
    command.value.slots.push(slot);
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
  });

  it('preserves legacy raw metadata on retained rows while validating only changed fields', () => {
    const command = setlistSaveCommand(); const base = command.baseValue!.slots[0]; const desired = command.value.slots[0];
    base.assigned_key = desired.assignedKey = 'Legacy key'; base.notes = desired.notes = 'x'.repeat(2100);
    base.slide_settings = desired.slideSettings = ['old-layout'];
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    expect(prepareMobileSetlistSave(command).slots[0]).toMatchObject({ assignedKey: 'Legacy key', notes: 'x'.repeat(2100), slideSettings: ['old-layout'] });
    desired.bandNotes = 'Changed cue'; expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    desired.slideSettings = ['different-invalid-layout']; expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    desired.slideSettings = { custom: ['new-layout'] }; expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    desired.assignedKey = '  D  '; expect(prepareMobileSetlistSave(command).slots[0].assignedKey).toBe('D');
    expect(desired.assignedKey).toBe('  D  ');
  });

  it('rejects retained local IDs that alias the aggregate or another original slot, while allowing their own source ID', () => {
    const command = setlistSaveCommand();
    const original = command.baseValue!.slots[0];
    command.baseValue!.slots.push({ ...original, id: id(41), song_order: 2 });
    for (const localId of [command.setlistId, command.commandId, id(41)]) {
      command.value.slots[0].localId = localId;
      expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    }
    command.value.slots[0].localId = original.id;
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    command.value.slots.unshift({ ...command.value.slots[0], localId: id(41), sourceSlotId: id(41) });
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    command.value.slots[1].localId = id(41);
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
  });

  it.each([{ assignedKey: '' }, { assignedKey: 'long' }, { notes: 'x'.repeat(2001) }, { bandNotes: 'x'.repeat(4001) },
    { arrangement: 'x'.repeat(4001) }, { leadMemberId: '' }, { youtubeUrl: 'x'.repeat(501) }, { slideSettings: [] }, { slideSettings: null }])('rejects invalid changed slot fields %j', change => {
    const command = setlistSaveCommand(); Object.assign(command.value.slots[0], change);
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
  });

  it('permits nullable defaults for new rows and the website bulk-save choice of visible songs without inventing approval', () => {
    const command = setlistCreateCommand(); const slot = command.value.slots[0];
    Object.assign(slot, { notes: null, bandNotes: null, arrangement: null, leadMemberId: null, youtubeUrl: null, slideSettings: null });
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    expect(mobileSetlistCommandSchema.safeParse({ ...command, songStatus: 'approved' }).success).toBe(false);
  });

  it('requires exact captured template contents and stable placeholder IDs, including repeated template labels', () => {
    const command = setlistCreateCommand();
    command.template = { base: { id: id(50), team_id: setlistIdentity.teamId, name: 'Template', description: null,
      slots: [{ label: 'Praise', tag: 'Praise' }, { label: 'Praise', tag: 'Praise', unknown: { preserve: true } }], created_by: null, created_at: null },
    placeholders: [{ slotId: id(60), songId: id(61) }, { slotId: id(62), songId: id(63) }] };
    expect(prepareMobileSetlistSave(command).template).toEqual(command.template);
    for (const template of [{ ...command.template, placeholders: command.template.placeholders.slice(0, 1) },
      { ...command.template, placeholders: [command.template.placeholders[0], command.template.placeholders[0]] },
      { ...command.template, base: { ...command.template.base, slots: {} } },
      { ...command.template, placeholders: [{ slotId: id(90), songId: id(61) }, command.template.placeholders[1]] },
      { ...command.template, placeholders: [{ slotId: id(60), songId: command.value.slots[0].songId }, command.template.placeholders[1]] }]) {
      expect(mobileSetlistCommandSchema.safeParse({ ...command, template }).success).toBe(false);
    }
    expect(mobileSetlistCommandSchema.safeParse({ ...setlistSaveCommand(), template: command.template }).success).toBe(false);
  });

  it('enforces the combined 200-slot limit and keeps template placeholders in addition to selected songs', () => {
    const command = setlistCreateCommand(); const slot = command.value.slots[0];
    command.value.slots = Array.from({ length: 200 }, (_, index) => ({ ...slot, localId: id(1000 + index) }));
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    command.template = { base: { id: id(50), team_id: setlistIdentity.teamId, name: 'Template', description: null, slots: ['Any'], created_by: null, created_at: null }, placeholders: [{ slotId: id(60), songId: id(61) }] };
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    command.value.slots.pop(); expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
  });

  it('captures approved create links, preserves unknown update event state, and prevents relinking by form data', () => {
    const command = setlistCreateCommand(); command.linkedEventBase = setlistSaveCommand().linkedEventBase;
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    command.value.form.eventId = command.linkedEventBase!.id;
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    command.linkedEventBase!.approval_status = 'pending'; expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    const update = setlistSaveCommand(); update.value.form.eventId = id(99);
    expect(mobileSetlistCommandSchema.safeParse(update).success).toBe(false);
    delete update.value.form.eventId; update.linkedEventBase = null; update.baseValue!.linkedEvent = null;
    expect(mobileSetlistCommandSchema.safeParse(update).success).toBe(true);
    expect(prepareMobileSetlistSave(update).eventId).toBe(id(10));
  });

  it('requires explicit complete cascade consent and retains the event/sibling versions for deletion review', () => {
    const command = setlistDeleteCommand(); expect(mobileSetlistCommandSchema.parse(command)).toEqual(command);
    for (const cascade of [{ ...command.cascade, deleteLinkedEvent: false }, { ...command.cascade, unlinkSetlists: [command.cascade.unlinkSetlists[0], command.cascade.unlinkSetlists[0]] },
      { ...command.cascade, unlinkSetlists: [{ id: command.setlistId, revision: 7 }] }]) expect(mobileSetlistCommandSchema.safeParse({ ...command, cascade }).success).toBe(false);
    const unknown = structuredClone(command); unknown.baseValue.linkedEvent = null;
    expect(mobileSetlistCommandSchema.safeParse(unknown).success).toBe(false);
    command.baseValue.record.event_id = null; command.baseValue.linkedEvent = null;
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(false);
    command.cascade = { deleteLinkedEvent: false, unlinkSetlists: [] };
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
  });

  it('rejects foreign aggregate/event/template bases using authenticated workspace scope', () => {
    const command = setlistSaveCommand();
    expect(assertMobileSetlistCommandScope(command, setlistIdentity.teamId)).toEqual(command);
    expect(() => assertMobileSetlistCommandScope(command, id(99))).toThrow(/workspace/);
    const create = setlistCreateCommand(); create.linkedEventBase = command.linkedEventBase; create.value.form.eventId = id(10);
    create.linkedEventBase!.team_id = id(99);
    expect(() => assertMobileSetlistCommandScope(create, setlistIdentity.teamId)).toThrow(/workspace/);
    create.linkedEventBase = null; delete create.value.form.eventId;
    create.template = { base: { id: id(50), team_id: id(99), name: 'Template', description: null, slots: [], created_by: null, created_at: null }, placeholders: [] };
    expect(() => assertMobileSetlistCommandScope(create, setlistIdentity.teamId)).toThrow(/workspace/);
  });

  it('requires unique stable IDs and ordered dependencies, accepts prior receipts, and rejects actor/permission spoofing', () => {
    const first = setlistCreateCommand(); const second = { ...setlistSaveCommand(), commandId: id(82), dependsOn: [first.commandId] };
    expect(mobileSetlistCommandsRequestSchema.parse({ version: 2, commands: [first, second] }).commands).toHaveLength(2);
    for (const commands of [[second, first], [first, first], [{ ...first, dependsOn: [first.commandId] }], [{ ...first, dependsOn: [id(99), id(99)] }]]) {
      expect(mobileSetlistCommandsRequestSchema.safeParse({ version: 2, commands }).success).toBe(false);
    }
    expect(mobileSetlistCommandsRequestSchema.safeParse({ version: 2, commands: [{ ...first, dependsOn: [id(99)] }] }).success).toBe(true);
    expect(mobileSetlistCommandsRequestSchema.safeParse({ version: 2, commands: [first, { ...first, commandId: id(83), dependsOn: [first.commandId] }] }).success).toBe(false);
    for (const change of [{ actorId: id(99) }, { permissions: ['setlists.manage'] }, { commandId: first.setlistId }]) expect(mobileSetlistCommandSchema.safeParse({ ...first, ...change }).success).toBe(false);
  });

  it('rejects oversized UTF-8 command envelopes without truncating the complete saved original', () => {
    const command = setlistSaveCommand();
    command.baseValue!.record.presentation_settings = { large: '🎵'.repeat(270_000) };
    const before = structuredClone(command);
    expect(mobileSetlistCommandSchema.safeParse(command).success).toBe(true);
    expect(mobileSetlistCommandsRequestSchema.safeParse({ version: 2, commands: [command] }).success).toBe(false);
    expect(command).toEqual(before);
  });
});
