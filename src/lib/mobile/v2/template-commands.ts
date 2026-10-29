import { z } from 'zod';
import { mobileSetlistSnapshotSchema, mobileSetlistTemplateRowSchema } from './setlist-state';

export const MOBILE_TEMPLATE_COMMAND_MAX_BYTES = 1024 * 1024;
export const mobileTemplateSourceSongSchema = z.object({ id: z.uuid(), title: z.string() }).strict();
const common = { commandId: z.uuid(), templateId: z.uuid(), dependsOn: z.array(z.uuid()).max(25) };
export const mobileTemplateCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('template.create'), sourceBase: mobileSetlistSnapshotSchema,
    sourceSongs: z.array(mobileTemplateSourceSongSchema).max(200),
    value: z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(2000).nullable() }).strict(),
  }).strict(),
  z.object({ ...common, type: z.literal('template.delete'), baseValue: mobileSetlistTemplateRowSchema }).strict(),
]).superRefine((command, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (command.commandId === command.templateId || new Set(command.dependsOn).size !== command.dependsOn.length
    || command.dependsOn.includes(command.commandId)) issue('Keep distinct command/template IDs and distinct earlier dependencies.');
  if (command.type === 'template.delete') {
    if (command.baseValue.id !== command.templateId) issue('Capture the exact downloaded template to delete.');
  } else {
    const songs = new Set(command.sourceSongs.map(song => song.id));
    const referenced = new Set(command.sourceBase.slots.map(slot => slot.song_id));
    if (command.sourceBase.record.deleted_at !== null || command.sourceBase.slots.length > 200
      || command.templateId === command.sourceBase.record.id || command.commandId === command.sourceBase.record.id
      || songs.size !== command.sourceSongs.length || songs.size !== referenced.size || [...referenced].some(id => !songs.has(id))) {
      issue('Capture the full active saved setlist and each referenced song title once.');
    }
  }
});
export type MobileTemplateCommand = z.infer<typeof mobileTemplateCommandSchema>;
export type MobileTemplateCreateCommand = Extract<MobileTemplateCommand, { type: 'template.create' }>;
export const mobileTemplateCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileTemplateCommandSchema).min(1).max(25) }).strict()
  .superRefine((request, context) => {
    const positions = new Map(request.commands.map((command, index) => [command.commandId, index]));
    if (positions.size !== request.commands.length || new Set(request.commands.map(command => command.templateId)).size !== request.commands.length
      || request.commands.some((command, index) => command.dependsOn.some(id => (positions.get(id) ?? -1) >= index))) {
      context.addIssue({ code: 'custom', message: 'Use distinct commands, one unresolved command per template, and earlier dependencies.' });
    }
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MOBILE_TEMPLATE_COMMAND_MAX_BYTES) {
      context.addIssue({ code: 'custom', message: 'Keep this large template intent in its saved draft.' });
    }
  });

export function assertMobileTemplateCommandScope(input: MobileTemplateCommand, teamId: string) {
  const command = mobileTemplateCommandSchema.parse(input);
  z.uuid().parse(teamId);
  const capturedTeam = command.type === 'template.create' ? command.sourceBase.record.team_id : command.baseValue.team_id;
  if (capturedTeam !== teamId) throw new Error('This template intent belongs to another workspace. Keep its saved draft.');
  return command;
}

/** Website mapping: occurrence order/title only; never capture arrangement, key or notes. */
export function prepareMobileTemplateSlots(command: MobileTemplateCreateCommand) {
  const titles = new Map(command.sourceSongs.map(song => [song.id, song.title]));
  return [...command.sourceBase.slots].sort((left, right) => left.song_order - right.song_order)
    .map(slot => ({ order: slot.song_order, label: titles.get(slot.song_id) || 'Song', tag: '' }));
}
