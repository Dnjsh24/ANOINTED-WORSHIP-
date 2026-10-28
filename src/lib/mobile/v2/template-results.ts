import { z } from 'zod';
import { jsonEqual } from '../json-equal';
import { assertMobileTemplateCommandScope, mobileTemplateSourceSongSchema, prepareMobileTemplateSlots, type MobileTemplateCommand } from './template-commands';
import { mobileSetlistSnapshotSchema, mobileSetlistTemplateRowSchema } from './setlist-state';
import { mobileWorkflowIdentitySchema } from './workflow-commands';

const common = { commandId: z.uuid(), templateId: z.uuid(), type: z.enum(['template.create', 'template.delete']), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
export const mobileTemplateResultSchema = z.discriminatedUnion('status', [
  z.object({ ...common, status: z.literal('applied'), outcome: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('created'), template: mobileSetlistTemplateRowSchema }).strict(),
    z.object({ kind: z.literal('deleted'), templateId: z.uuid() }).strict(),
  ]) }).strict(),
  z.object({ ...common, status: z.literal('conflict'), baseValue: z.union([mobileSetlistSnapshotSchema, mobileSetlistTemplateRowSchema]), localValue: z.json(),
    remote: z.object({ source: mobileSetlistSnapshotSchema.nullable(), songs: z.array(mobileTemplateSourceSongSchema), template: mobileSetlistTemplateRowSchema.nullable() }).strict(),
  }).strict(),
  z.object({ ...common, status: z.literal('rejected'), code: z.enum(['permission', 'unavailable', 'invalid', 'command_id_conflict']), message: z.string().max(250) }).strict(),
  z.object({ ...common, status: z.literal('blocked'), code: z.literal('dependency'), message: z.string().max(250) }).strict(),
]);
export type MobileTemplateResult = z.infer<typeof mobileTemplateResultSchema>;
export const mobileTemplateCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema,
  results: z.array(mobileTemplateResultSchema).min(1).max(25) }).strict();

export function templateConflictValues(command: MobileTemplateCommand): Pick<Extract<MobileTemplateResult, { status: 'conflict' }>, 'baseValue' | 'localValue'> {
  return command.type === 'template.create'
    ? { baseValue: command.sourceBase, localValue: { sourceSongs: command.sourceSongs, value: command.value } }
    : { baseValue: command.baseValue, localValue: {} };
}

/** A historical receipt confirms that commit; it cannot promote an old row into the current catalog. */
export function assertMobileTemplateResult(input: MobileTemplateCommand, actorInput: z.infer<typeof mobileWorkflowIdentitySchema>, value: unknown): MobileTemplateResult {
  const actor = mobileWorkflowIdentitySchema.parse(actorInput);
  const command = assertMobileTemplateCommandScope(input, actor.teamId);
  const result = mobileTemplateResultSchema.parse(value);
  const invalid = () => { throw new Error('Template confirmation does not match the saved intent and workspace. Keep its original draft.'); };
  if (result.commandId !== command.commandId || result.templateId !== command.templateId || result.type !== command.type) invalid();
  if (result.status === 'applied') {
    const outcome = result.outcome;
    if (command.type === 'template.create') {
      if (outcome.kind !== 'created') invalid();
      else {
        const row = outcome.template;
        if (row.id !== command.templateId || row.team_id !== actor.teamId || row.name !== command.value.name
          || row.description !== command.value.description || row.created_by !== actor.userId || row.created_at === null
          || !jsonEqual(row.slots, prepareMobileTemplateSlots(command))) invalid();
      }
    } else if (outcome.kind !== 'deleted' || outcome.templateId !== command.templateId) invalid();
  } else if (result.status === 'conflict') {
    const expected = templateConflictValues(command); const remote = result.remote;
    const sourceIds = new Set(remote.source?.slots.map(slot => slot.song_id) ?? []);
    if (!jsonEqual(result.baseValue, expected.baseValue) || !jsonEqual(result.localValue, expected.localValue)
      || (remote.template && (remote.template.id !== command.templateId || remote.template.team_id !== actor.teamId))
      || (command.type === 'template.delete' && (remote.source !== null || remote.songs.length !== 0))
      || (remote.source && (command.type !== 'template.create' || remote.source.record.id !== command.sourceBase.record.id || remote.source.record.team_id !== actor.teamId))
      || remote.songs.length !== sourceIds.size
      || new Set(remote.songs.map(song => song.id)).size !== remote.songs.length
      || remote.songs.some(song => !sourceIds.has(song.id))) invalid();
  }
  return result;
}
