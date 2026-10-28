import type { MobileTemplateCommand, MobileTemplateCreateCommand } from './template-commands';
import type { MobileTemplateResult } from './template-results';
import { prepareMobileTemplateSlots } from './template-commands';
import { id, setlistSnapshot, setlistIdentity } from './setlist-state-test-fixture';

export { id };
export const templateIdentity = { userId: setlistIdentity.userId, teamId: setlistIdentity.teamId, memberId: setlistIdentity.memberId };
export function templateCreateCommand(): MobileTemplateCreateCommand {
  return { commandId: id(180), templateId: id(181), type: 'template.create', dependsOn: [], sourceBase: setlistSnapshot(),
    sourceSongs: [{ id: id(30), title: 'Test song' }], value: { name: 'Sunday pattern', description: 'Keep this description' } };
}
export function templateRow(command = templateCreateCommand()) {
  return { id: command.templateId, team_id: templateIdentity.teamId, name: command.value.name, description: command.value.description,
    slots: prepareMobileTemplateSlots(command), created_by: templateIdentity.userId, created_at: '2026-10-19T00:00:00Z' };
}
export function templateDeleteCommand(): Extract<MobileTemplateCommand, { type: 'template.delete' }> {
  return { commandId: id(182), templateId: id(181), type: 'template.delete', dependsOn: [], baseValue: templateRow() };
}
export function templateApplied(command: MobileTemplateCommand = templateCreateCommand()): MobileTemplateResult {
  return { commandId: command.commandId, templateId: command.templateId, type: command.type, payloadHash: 'a'.repeat(64), status: 'applied',
    outcome: command.type === 'template.create' ? { kind: 'created', template: templateRow(command) } : { kind: 'deleted', templateId: command.templateId } };
}
