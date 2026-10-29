import { z } from 'zod';
import { jsonEqual } from '../json-equal';
import { assertMobileSetlistCommandScope, mobileSetlistCommandSchema, prepareMobileSetlistSave, type MobileSetlistCommand, type MobileSetlistSaveCommand } from './setlist-commands';
import { mobileSetlistSnapshotSchema, mobileSetlistTemplateRowSchema } from './setlist-state';
import { mobileWorkflowIdentitySchema } from './workflow-commands';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cascadeSchema = z.object({ deleteLinkedEvent: z.boolean(), unlinkSetlists: z.array(z.object({ id: z.uuid(), revision }).strict()) }).strict();
export const mobileSetlistDeleteReviewSchema = z.object({
  snapshot: mobileSetlistSnapshotSchema, cascade: cascadeSchema, siblings: z.array(mobileSetlistSnapshotSchema),
}).strict().superRefine((review, context) => {
  const { record, linkedEvent } = review.snapshot;
  const siblings = new Map(review.siblings.map(row => [row.record.id, row]));
  if (record.deleted_at !== null || siblings.size !== review.siblings.length || review.cascade.deleteLinkedEvent !== (record.event_id !== null)
    || (record.event_id !== null && (!linkedEvent || linkedEvent.deleted_at !== null))
    || (record.event_id === null && review.siblings.length !== 0)
    || new Set(review.cascade.unlinkSetlists.map(row => row.id)).size !== review.cascade.unlinkSetlists.length
    || review.cascade.unlinkSetlists.length !== review.siblings.length
    || review.siblings.some(row => row.record.id === record.id || row.record.team_id !== record.team_id || row.record.event_id !== record.event_id)
    || review.cascade.unlinkSetlists.some(row => siblings.get(row.id)?.record.sync_revision !== row.revision)) {
    context.addIssue({ code: 'custom', message: 'Review the exact linked event and every affected sibling, including deleted setlists.' });
  }
});
export type MobileSetlistDeleteReview = z.infer<typeof mobileSetlistDeleteReviewSchema>;
const tombstone = z.object({ id: z.uuid(), revision: revision.positive(), deleted: z.literal(true) }).strict();
const outcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), snapshot: mobileSetlistSnapshotSchema,
    placeholders: z.array(z.object({ index: z.number().int().min(0).max(199), slotId: z.uuid(), songId: z.uuid() }).strict()).max(200) }).strict(),
  z.object({ kind: z.literal('deleted'), setlist: tombstone, event: tombstone.nullable(), unlinkedSetlists: z.array(mobileSetlistSnapshotSchema) }).strict(),
]);
const common = { commandId: z.uuid(), setlistId: z.uuid(), type: z.enum(['setlist.save', 'setlist.delete']), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
export const mobileSetlistResultSchema = z.discriminatedUnion('status', [
  z.object({ ...common, status: z.literal('applied'), outcome }).strict(),
  z.object({ ...common, status: z.literal('conflict'), baseValue: mobileSetlistSnapshotSchema.nullable(), localValue: z.json(),
    remote: z.object({ snapshot: mobileSetlistSnapshotSchema.nullable(), template: mobileSetlistTemplateRowSchema.nullable(), deleteReview: mobileSetlistDeleteReviewSchema.nullable() }).strict() }).strict(),
  z.object({ ...common, status: z.literal('rejected'), code: z.enum(['permission', 'unavailable', 'invalid', 'command_id_conflict']), message: z.string().max(250) }).strict(),
  z.object({ ...common, status: z.literal('blocked'), code: z.literal('dependency'), message: z.string().max(250) }).strict(),
]);
export type MobileSetlistResult = z.infer<typeof mobileSetlistResultSchema>;
export const mobileSetlistCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema,
  results: z.array(mobileSetlistResultSchema).min(1).max(25) }).strict();
export const mobileSetlistDeleteReviewResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema, review: mobileSetlistDeleteReviewSchema }).strict();

/** Include every local operation field; a conflict must not lose template or cascade intent. */
export function setlistConflictValues(input: MobileSetlistCommand) {
  const command = mobileSetlistCommandSchema.parse(input);
  return { baseValue: command.baseValue, localValue: z.json().parse(JSON.parse(JSON.stringify(command.type === 'setlist.save'
    ? { mode: command.mode, value: command.value, linkedEventBase: command.linkedEventBase, template: command.template }
    : { cascade: command.cascade }))) };
}
const sameInstant = (left: string, right: string) => Date.parse(left) === Date.parse(right);
const sameClock = (left: string | null, right: string | null) => left === null || right === null ? left === right
  : left.split(':').reduce((total, part, index) => total + Number(part) * [3600, 60, 1][index], 0)
    === right.split(':').reduce((total, part, index) => total + Number(part) * [3600, 60, 1][index], 0);

function matchesSavedIntent(command: MobileSetlistSaveCommand, saved: Extract<z.infer<typeof outcome>, { kind: 'saved' }>, actor: z.infer<typeof mobileWorkflowIdentitySchema>) {
  const snapshot = saved.snapshot; const record = snapshot.record; const base = command.baseValue;
  const prepared = prepareMobileSetlistSave(command); const details = prepared.details;
  if (record.id !== command.setlistId || record.team_id !== actor.teamId || record.deleted_at !== null || record.sync_revision <= command.baseRevision
    || record.name !== details.name || record.setlist_date !== details.setlist_date || record.event_id !== prepared.eventId
    || record.location !== details.location || !sameClock(record.call_time, details.call_time) || !sameClock(record.rehearsal_time, details.rehearsal_time)
    || !jsonEqual(record.service_times, details.service_times) || record.notes !== details.notes
    || record.leader_member_id !== (details.leader_member_id !== undefined ? details.leader_member_id : base?.record.leader_member_id ?? null)
    || !jsonEqual(record.presentation_settings, base ? base.record.presentation_settings : {})
    || record.created_by !== (base?.record.created_by ?? actor.userId) || (base && !sameInstant(record.created_at, base.record.created_at))) return false;
  const placeholders = command.template?.placeholders ?? [];
  if (saved.placeholders.length !== placeholders.length || snapshot.slots.length !== placeholders.length + prepared.slots.length) return false;
  for (const [index, expected] of placeholders.entries()) {
    const mapping = saved.placeholders[index]; const slot = snapshot.slots[index];
    if (mapping.index !== index || mapping.slotId !== expected.slotId || mapping.songId !== expected.songId
      || slot.id !== expected.slotId || slot.song_id !== expected.songId || slot.song_order !== index + 1 || slot.sync_revision < 1
      || slot.assigned_key !== 'C' || slot.band_notes !== null || slot.arrangement !== null || slot.lead_member_id !== null || slot.youtube_url !== null || slot.slide_settings !== null) return false;
    // The server generates text from arbitrary stored template JSON; it remains authoritative for non-string legacy tags.
    if (!slot.notes?.startsWith('Template Tag: ')) return false;
    const templateSlots = command.template!.base.slots;
    const value = Array.isArray(templateSlots) ? templateSlots[index] : null;
    const tag = value && typeof value === 'object' && !Array.isArray(value) ? value.tag : undefined;
    if ((tag === undefined || tag === null || typeof tag === 'string') && slot.notes !== `Template Tag: ${tag || 'none'}`) return false;
  }
  const originalSlots = new Map(base?.slots.map(slot => [slot.id, slot]) ?? []);
  return prepared.slots.every((expected, index) => {
    const slot = snapshot.slots[placeholders.length + index]; const original = expected.sourceSlotId ? originalSlots.get(expected.sourceSlotId) : undefined;
    return slot.id === (expected.sourceSlotId ?? expected.localId) && slot.song_id === expected.songId && slot.song_order === placeholders.length + index + 1
      && slot.sync_revision > (original?.sync_revision ?? 0) && slot.assigned_key === expected.assignedKey && slot.notes === expected.notes
      && slot.band_notes === expected.bandNotes && slot.arrangement === expected.arrangement && slot.lead_member_id === expected.leadMemberId
      && slot.youtube_url === expected.youtubeUrl && jsonEqual(slot.slide_settings, expected.slideSettings)
      && (!original || sameInstant(slot.created_at, original.created_at));
  });
}

/** A receipt describes its committed operation, not a guarantee that no later website write occurred. */
export function assertMobileSetlistResult(input: MobileSetlistCommand, actorInput: z.infer<typeof mobileWorkflowIdentitySchema>, value: unknown): MobileSetlistResult {
  const actor = mobileWorkflowIdentitySchema.parse(actorInput);
  const command = assertMobileSetlistCommandScope(input, actor.teamId);
  const result = mobileSetlistResultSchema.parse(value);
  const invalid = () => { throw new Error('Setlist confirmation does not match the saved intent and workspace. Keep its original draft.'); };
  if (result.commandId !== command.commandId || result.setlistId !== command.setlistId || result.type !== command.type) invalid();
  if (result.status === 'applied') {
    const saved = result.outcome;
    if (command.type === 'setlist.save') {
      if (saved.kind !== 'saved' || !matchesSavedIntent(command, saved, actor)) invalid();
    } else if (saved.kind !== 'deleted') invalid();
    else {
      const siblings = new Map(command.cascade.unlinkSetlists.map(row => [row.id, row.revision]));
      if (saved.setlist.id !== command.setlistId || saved.setlist.revision <= command.baseRevision
        || (command.baseValue.record.event_id === null ? saved.event !== null : saved.event?.id !== command.baseValue.record.event_id
          || saved.event.revision <= (command.baseValue.linkedEvent?.sync_revision ?? Number.MAX_SAFE_INTEGER))
        || saved.unlinkedSetlists.length !== siblings.size || new Set(saved.unlinkedSetlists.map(row => row.record.id)).size !== siblings.size
        || saved.unlinkedSetlists.some(row => !siblings.has(row.record.id) || row.record.team_id !== actor.teamId || row.record.event_id !== null
          || row.linkedEvent !== null || row.record.sync_revision <= siblings.get(row.record.id)!)) invalid();
    }
  } else if (result.status === 'conflict') {
    const expected = setlistConflictValues(command); const remote = result.remote;
    if (!jsonEqual(result.baseValue, expected.baseValue) || !jsonEqual(result.localValue, expected.localValue)
      || (remote.snapshot && (remote.snapshot.record.id !== command.setlistId || remote.snapshot.record.team_id !== actor.teamId))
      || (remote.template && (command.type !== 'setlist.save' || remote.template.id !== command.template?.base.id || remote.template.team_id !== actor.teamId))
      || (remote.deleteReview && (command.type !== 'setlist.delete' || !jsonEqual(remote.deleteReview.snapshot, remote.snapshot)))) invalid();
  }
  return result;
}
