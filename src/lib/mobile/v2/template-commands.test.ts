import { expect, it } from 'vitest';
import { assertMobileTemplateCommandScope, mobileTemplateCommandSchema, mobileTemplateCommandsRequestSchema, prepareMobileTemplateSlots } from './template-commands';
import { assertMobileTemplateResult, templateConflictValues } from './template-results';
import { templateCreateCommand, templateDeleteCommand, templateApplied, templateIdentity, id } from './template-command-test-fixture';

it('maps duplicate song occurrences in saved order to website labels and empty tags only', () => {
  const command = templateCreateCommand();
  command.sourceBase.slots.unshift({ ...command.sourceBase.slots[0], id: id(41), song_order: 2, arrangement: 'Private arrangement' });
  expect(mobileTemplateCommandSchema.parse(command)).toEqual(command);
  expect(prepareMobileTemplateSlots(command)).toEqual([{ order: 1, label: 'Test song', tag: '' }, { order: 2, label: 'Test song', tag: '' }]);
  command.sourceSongs[0].title = '';
  expect(prepareMobileTemplateSlots(command).map(row => row.label)).toEqual(['Song', 'Song']);
});
it('requires the exact active source, referenced unique titles, template base and distinct identities/dependencies', () => {
  const create = templateCreateCommand(); const remove = templateDeleteCommand();
  const invalid = [
    { ...create, sourceSongs: [] }, { ...create, sourceSongs: [...create.sourceSongs, ...create.sourceSongs] },
    { ...create, sourceSongs: [{ id: id(99), title: 'Foreign' }] },
    { ...create, sourceBase: { ...create.sourceBase, record: { ...create.sourceBase.record, deleted_at: '2026-10-19T00:00:00Z' } } },
    { ...create, commandId: create.templateId }, { ...create, templateId: create.sourceBase.record.id },
    { ...create, dependsOn: [create.commandId] }, { ...create, dependsOn: [id(99), id(99)] },
    { ...remove, templateId: id(99) }, { ...create, value: { ...create.value, arrangement: 'No richer capture' } },
  ];
  invalid.forEach(command => expect(mobileTemplateCommandSchema.safeParse(command).success).toBe(false));
  expect(assertMobileTemplateCommandScope(create, templateIdentity.teamId)).toEqual(create);
  expect(() => assertMobileTemplateCommandScope(create, id(99))).toThrow('another workspace');
});
it('rejects forward dependencies, duplicate targets and oversized UTF-8 intent batches', () => {
  const first = templateCreateCommand(); const second = { ...first, commandId: id(184), templateId: id(185) };
  expect(mobileTemplateCommandsRequestSchema.safeParse({ version: 2, commands: [first, { ...second, dependsOn: [first.commandId] }] }).success).toBe(true);
  for (const commands of [[first, { ...second, templateId: first.templateId }], [{ ...first, dependsOn: [second.commandId] }, second],
    [{ ...first, sourceSongs: [{ ...first.sourceSongs[0], title: 'あ'.repeat(400_000) }] }]]) {
    expect(mobileTemplateCommandsRequestSchema.safeParse({ version: 2, commands }).success).toBe(false);
  }
});
it('validates exact committed slot metadata, identity, description and actor without promoting current catalog state', () => {
  for (const command of [templateCreateCommand(), templateDeleteCommand()]) expect(assertMobileTemplateResult(command, templateIdentity, templateApplied(command))).toEqual(templateApplied(command));
  const command = templateCreateCommand(); const result = templateApplied(command);
  if (result.status !== 'applied' || result.outcome.kind !== 'created') throw new Error('Created fixture required.');
  const row = result.outcome.template;
  for (const template of [{ ...row, name: 'Other' }, { ...row, team_id: id(99) }, { ...row, created_by: id(99) },
    { ...row, description: null }, { ...row, slots: [{ order: 1, label: 'Test song', tag: 'Unexpected tag' }] }, { ...row, created_at: null }]) {
    expect(() => assertMobileTemplateResult(command, templateIdentity, { ...result, outcome: { kind: 'created', template } })).toThrow();
  }
});
it('keeps full conflict intent and rejects foreign or substituted source/template records', () => {
  const command = templateCreateCommand(); const applied = templateApplied(command);
  const conflict = { ...applied, status: 'conflict', outcome: undefined, ...templateConflictValues(command), remote: { source: command.sourceBase, songs: command.sourceSongs, template: null } };
  delete conflict.outcome;
  expect(assertMobileTemplateResult(command, templateIdentity, conflict)).toEqual(conflict);
  expect(() => assertMobileTemplateResult(command, templateIdentity, { ...conflict, localValue: { value: command.value } })).toThrow();
  expect(() => assertMobileTemplateResult(command, templateIdentity, { ...conflict, remote: { ...conflict.remote, songs: [{ id: id(99), title: 'Other' }] } })).toThrow();
});
