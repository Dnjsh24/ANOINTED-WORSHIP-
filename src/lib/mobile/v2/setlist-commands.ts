import { z } from 'zod';
import { buildSetlistDetails } from '@/lib/domain/event-workflows';
import { normalizeSetlistServiceTimes } from '@/lib/domain/event-types';
import { jsonEqual } from '../json-equal';
import { mobileEventRowSchema } from './event-read-models';
import { mobileSetlistDesiredSlotSchema, mobileSetlistFormSchema, validateSetlistSlotChanges } from './setlist-command-fields';
import { mobileSetlistSnapshotSchema, mobileSetlistTemplateRowSchema } from './setlist-state';

// Larger drafts remain in SQLite until resumable command transport is implemented.
export const MOBILE_SETLIST_COMMAND_MAX_BYTES = 1024 * 1024;
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const common = { commandId: z.uuid(), setlistId: z.uuid(), baseRevision: revision, dependsOn: z.array(z.uuid()).max(25) };
const templateSchema = z.object({
  base: mobileSetlistTemplateRowSchema,
  // Position in this array is the exact captured template slot position. These IDs must be saved before any attempt.
  placeholders: z.array(z.object({ slotId: z.uuid(), songId: z.uuid() }).strict()).max(200),
}).strict();
const cascadeSchema = z.object({
  deleteLinkedEvent: z.boolean(),
  unlinkSetlists: z.array(z.object({ id: z.uuid(), revision }).strict()),
}).strict();

export const mobileSetlistCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('setlist.save'), mode: z.enum(['create', 'update']),
    baseValue: mobileSetlistSnapshotSchema.nullable(), linkedEventBase: mobileEventRowSchema.nullable(),
    template: templateSchema.nullable(), value: z.object({ form: mobileSetlistFormSchema, slots: z.array(mobileSetlistDesiredSlotSchema).max(200) }).strict(),
  }).strict(),
  z.object({ ...common, type: z.literal('setlist.delete'), baseValue: mobileSetlistSnapshotSchema, cascade: cascadeSchema }).strict(),
]).superRefine((command, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (command.type === 'setlist.save' && command.mode === 'create') {
    if (command.baseValue !== null || command.baseRevision !== 0) issue('A new setlist has no saved aggregate base and revision zero.');
  } else if (!command.baseValue || command.baseValue.record.id !== command.setlistId
    || command.baseValue.record.sync_revision !== command.baseRevision || command.baseValue.record.deleted_at !== null) {
    issue('Capture this active setlist’s exact original aggregate and revision.');
  }
  if (new Set(command.dependsOn).size !== command.dependsOn.length || command.dependsOn.includes(command.commandId)) issue('Dependencies must be distinct earlier command receipts.');
  if (command.commandId === command.setlistId) issue('Keep the command ID separate from the setlist identity.');
  if (command.type === 'setlist.delete') {
    const eventId = command.baseValue.record.event_id;
    const siblings = command.cascade.unlinkSetlists;
    if (new Set(siblings.map(row => row.id)).size !== siblings.length || siblings.some(row => row.id === command.setlistId)) issue('Capture each linked sibling setlist once, excluding the deleted setlist.');
    if (eventId ? !command.cascade.deleteLinkedEvent || !command.baseValue.linkedEvent || command.baseValue.linkedEvent.deleted_at !== null
      : command.cascade.deleteLinkedEvent || siblings.length !== 0) issue('Explicitly review the linked event deletion and every surviving setlist that will be unlinked. Unknown cascade scope stays draft-only.');
    return;
  }
  const { slots, form } = command.value;
  const template = command.template;
  const original = command.baseValue;
  if (command.mode === 'update') {
    if (template || !jsonEqual(command.linkedEventBase, original?.linkedEvent ?? null)
      || (form.eventId !== undefined && (form.eventId || null) !== original?.record.event_id)) issue('A setlist update preserves its original event link and cannot apply a new template.');
  } else if ((form.eventId || null) !== (command.linkedEventBase?.id ?? null)
    || (command.linkedEventBase && (command.linkedEventBase.approval_status !== 'approved' || command.linkedEventBase.deleted_at !== null))) {
    issue('Capture the selected active approved event before queuing a new linked setlist.');
  }
  if (template && (!Array.isArray(template.base.slots) || template.base.slots.length !== template.placeholders.length
    || template.placeholders.length + slots.length > 200)) issue('Capture the complete template and distinct IDs for all its placeholders, within the website’s 200-slot limit.');
  const baseSlots = new Map(original?.slots.map(slot => [slot.id, slot]) ?? []);
  const localIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const base = slot.sourceSlotId ? baseSlots.get(slot.sourceSlotId) : undefined;
    const targetId = slot.sourceSlotId ?? slot.localId;
    if (localIds.has(slot.localId) || targetIds.has(targetId) || slot.localId === command.setlistId || slot.localId === command.commandId
      || targetId === command.commandId || targetId === command.setlistId || (baseSlots.has(slot.localId) && slot.localId !== slot.sourceSlotId)
      || (slot.sourceSlotId ? !base || base.song_id !== slot.songId : baseSlots.has(slot.localId))) issue('Keep distinct local/original slot IDs and the same song for each retained occurrence.');
    localIds.add(slot.localId); targetIds.add(targetId);
    validateSetlistSlotChanges(slot, base, context, index);
  }
  const newIds = new Set([command.commandId, command.setlistId, ...localIds, ...targetIds]);
  const songIds = new Set([...slots.map(slot => slot.songId), ...original?.slots.map(slot => slot.song_id) ?? []]);
  for (const placeholder of template?.placeholders ?? []) {
    if (newIds.has(placeholder.slotId) || newIds.has(placeholder.songId) || songIds.has(placeholder.songId)
      || placeholder.slotId === placeholder.songId || baseSlots.has(placeholder.slotId)) issue('Keep each template placeholder’s stable song and slot IDs distinct from existing work.');
    newIds.add(placeholder.slotId); newIds.add(placeholder.songId);
  }
});
export type MobileSetlistCommand = z.infer<typeof mobileSetlistCommandSchema>;
export type MobileSetlistSaveCommand = Extract<MobileSetlistCommand, { type: 'setlist.save' }>;

export const mobileSetlistCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileSetlistCommandSchema).min(1).max(25) }).strict()
  .superRefine((request, context) => {
    const positions = new Map(request.commands.map((command, index) => [command.commandId, index]));
    if (positions.size !== request.commands.length || request.commands.some((command, index) => command.dependsOn.some(id => (positions.get(id) ?? -1) >= index))) {
      context.addIssue({ code: 'custom', message: 'Command IDs must be unique and dependencies must precede their command.' });
    }
    // Later local edits stay in raw storage until this aggregate receives an authoritative result.
    if (new Set(request.commands.map(command => command.setlistId)).size !== request.commands.length) {
      context.addIssue({ code: 'custom', message: 'Send only one unresolved command per setlist. Keep newer changes in its raw draft.' });
    }
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MOBILE_SETLIST_COMMAND_MAX_BYTES) {
      context.addIssue({ code: 'custom', message: 'This setlist needs resumable transfer. Keep its saved raw draft.' });
    }
  });

/** Scope is supplied by verified membership, never by an editable form or its client-side labels. */
export function assertMobileSetlistCommandScope(input: MobileSetlistCommand, teamId: string) {
  const command = mobileSetlistCommandSchema.parse(input);
  z.uuid().parse(teamId);
  if ((command.baseValue && command.baseValue.record.team_id !== teamId) || (command.type === 'setlist.save'
    && ((command.template && command.template.base.team_id !== teamId) || (command.linkedEventBase && command.linkedEventBase.team_id !== teamId)))) {
    throw new Error('This setlist intent contains records from another workspace. Keep its original draft.');
  }
  return command;
}

/** Same detail builder as website actions. A setlist save never edits or creates a Timeline event. */
export function prepareMobileSetlistSave(input: MobileSetlistSaveCommand) {
  const command = mobileSetlistCommandSchema.parse(input);
  if (command.type !== 'setlist.save') throw new Error('A setlist save intent is required.');
  const form = command.value.form;
  const baseSlots = new Map(command.baseValue?.slots.map(slot => [slot.id, slot]) ?? []);
  return {
    details: { ...buildSetlistDetails(form, normalizeSetlistServiceTimes(form.eventType, form.serviceType)), update_event: false as const },
    eventId: command.mode === 'update' ? command.baseValue!.record.event_id : command.linkedEventBase?.id ?? null,
    slots: command.value.slots.map(slot => ({ ...slot,
      assignedKey: baseSlots.get(slot.sourceSlotId ?? '')?.assigned_key === slot.assignedKey ? slot.assignedKey : slot.assignedKey.trim(),
    })),
    template: command.template,
  };
}
