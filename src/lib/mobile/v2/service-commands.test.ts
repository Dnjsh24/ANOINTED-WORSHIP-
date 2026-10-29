// @vitest-environment node
import { expect, it } from 'vitest';
import { mobileServiceCommandSchema, mobileServiceCommandsRequestSchema, type MobileServiceCommand } from './service-commands';
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
function order(): Extract<MobileServiceCommand, { type: 'service.order.save' }> {
  return { commandId: id(1), eventId: id(2), baseEventRevision: 7, dependsOn: [], type: 'service.order.save', baseOrder: null,
    value: { entries: [{ id: id(3), kind: 'prayer', title: 'Prayer', slot_id: null, duration_seconds: 120, responsible_member_id: null, cue: 'Opening' }], requiredRoles: ['Media'] } };
}
function assignment(): Extract<MobileServiceCommand, { type: 'service.assignment.respond' }> {
  return { commandId: id(10), eventId: id(2), baseEventRevision: 7, dependsOn: [], type: 'service.assignment.respond',
    baseAssignment: { id: id(11), eventId: id(2), memberId: id(12), assignment: 'Media' }, baseResponse: { state: 'pending', note: 'Keep original' },
    responseVersion: { assignmentId: id(11), memberId: id(12), revision: 2, deleted: false }, value: { state: 'confirmed', note: 'Ready' } };
}
it('uses the website service order validation and normalization, without accepting duplicate entries or roles', () => {
  const value = order(); value.value.entries[0].title = '  Prayer  '; value.value.requiredRoles = [' Media '];
  expect(mobileServiceCommandSchema.parse(value)).toMatchObject({ value: { entries: [{ title: 'Prayer' }], requiredRoles: ['Media'] } });
  for (const invalid of [{ ...value, value: { ...value.value, entries: [value.value.entries[0], value.value.entries[0]] } },
    { ...value, value: { ...value.value, requiredRoles: ['Media', ' Media '] } },
    { ...value, value: { ...value.value, entries: [{ ...value.value.entries[0], title: '' }] } },
    { ...value, value: { ...value.value, entries: [{ ...value.value.entries[0], kind: 'song', slot_id: null }] } }]) {
    expect(mobileServiceCommandSchema.safeParse(invalid).success).toBe(false);
  }
});
it('checks actual request rules, including reason, stable nonce, unique fields and website proposal size', () => {
  const value = { ...order(), type: 'service.order.request', reason: ' Improve timing ' };
  expect(mobileServiceCommandSchema.parse(value)).toMatchObject({ reason: 'Improve timing' });
  expect(mobileServiceCommandSchema.safeParse({ ...value, reason: ' ' }).success).toBe(false);
  const entry = order().value.entries[0];
  const large = { ...value, value: { entries: Array.from({ length: 140 }, (_, index) => ({ ...entry, id: id(100 + index), cue: 'x'.repeat(2000) })), requiredRoles: [] } };
  expect(mobileServiceCommandSchema.safeParse(large).success).toBe(false);
});
it('requires explicit durable assignment state and exact membership/event references', () => {
  expect(mobileServiceCommandSchema.safeParse(assignment()).success).toBe(true);
  for (const value of [{ ...assignment(), responseVersion: null }, { ...assignment(), responseVersion: { ...assignment().responseVersion, memberId: id(99) } },
    { ...assignment(), baseAssignment: { ...assignment().baseAssignment, eventId: id(99) } }, { ...assignment(), baseResponse: null },
    { ...assignment(), responseVersion: { ...assignment().responseVersion, revision: 0 } }]) {
    expect(mobileServiceCommandSchema.safeParse(value).success).toBe(false);
  }
  const absent = { ...assignment(), baseResponse: null, responseVersion: { ...assignment().responseVersion, revision: 0, deleted: true } };
  expect(mobileServiceCommandSchema.safeParse(absent).success).toBe(true);
  expect(mobileServiceCommandSchema.safeParse({ ...absent, responseVersion: { ...absent.responseVersion, revision: 8 } }).success).toBe(true);
});
it('rejects identity spoofing, dependency cycles, duplicate IDs and foreign order bases', () => {
  const first = order(); const second = { ...order(), commandId: id(5), dependsOn: [first.commandId] };
  expect(mobileServiceCommandsRequestSchema.safeParse({ version: 2, commands: [first, second] }).success).toBe(true);
  for (const commands of [[first, first], [second, first], [{ ...first, dependsOn: [first.commandId] }], [{ ...first, dependsOn: [id(8), id(8)] }]]) {
    expect(mobileServiceCommandsRequestSchema.safeParse({ version: 2, commands }).success).toBe(false);
  }
  expect(mobileServiceCommandSchema.safeParse({ ...first, actorId: id(99) }).success).toBe(false);
  expect(mobileServiceCommandSchema.safeParse({ ...first, baseOrder: { event_id: id(99), team_id: id(4), revision: 1, entries: [], required_roles: [], updated_by: id(6), updated_at: '2026-10-17T00:00:00Z' } }).success).toBe(false);
});
it('bounds complete transfer envelopes while leaving larger draft preservation to SQLite', () => {
  const value = order(); value.value.entries = Array.from({ length: 200 }, (_, index) => ({ ...value.value.entries[0], id: id(1000 + index), cue: 'x'.repeat(2000) }));
  expect(mobileServiceCommandsRequestSchema.safeParse({ version: 2, commands: [value] }).success).toBe(true);
  const large = Array.from({ length: 3 }, (_, index) => ({ ...value, commandId: id(3000 + index) }));
  expect(mobileServiceCommandsRequestSchema.safeParse({ version: 2, commands: large }).success).toBe(false);
});
