import { expect, it } from 'vitest';
import { id, setlistCreateCommand, setlistDeleteCommand, setlistSaveCommand } from './setlist-command-test-fixture';
import { setlistApplied, setlistReceiptIdentity as identity } from './setlist-result-test-fixture';
import { setlistConflictValues } from './setlist-results';
import { assertMobileSetlistCreateReview, mobileSetlistCreateReviewRequestSchema, mobileSetlistCreateReviewResponseSchema } from './setlist-create-review';

const command = setlistCreateCommand();
const request = { version: 2 as const, requestId: id(300), command };
const common = { commandId: command.commandId, setlistId: command.setlistId, type: command.type, payloadHash: 'a'.repeat(64) };
const receipt = { ...common, status: 'blocked' as const, code: 'dependency' as const, message: 'Resolve the dependency.' };
const response = { version: 2, requestId: request.requestId, identity, receipt, targetAbsent: true, checkedAt: '2026-10-19T00:00:00+00:00' };

it('accepts only validated original creates and refuses editable authority claims', () => {
  expect(mobileSetlistCreateReviewRequestSchema.parse(request)).toEqual(request);
  for (const invalid of [{ ...request, command: setlistSaveCommand() }, { ...request, command: setlistDeleteCommand() },
    { ...request, actorId: id(99) }, { ...request, requestId: 'unbound' },
    { ...request, command: { ...command, baseRevision: 1 } }, { ...request, command: { ...command, currentPermission: true } }]) {
    expect(mobileSetlistCreateReviewRequestSchema.safeParse(invalid).success).toBe(false);
  }
});
it('accepts eligible immutable results and binds exact request, current identity and saved intent', () => {
  const conflict = { ...common, status: 'conflict', ...setlistConflictValues(command), remote: { snapshot: null, template: null, deleteReview: null } };
  for (const original of [receipt, conflict, ...['permission', 'unavailable'].map(code => ({ ...common, status: 'rejected', code, message: 'Retained.' }))]) {
    expect(assertMobileSetlistCreateReview(request, identity, { ...response, receipt: original })).toEqual({ ...response, receipt: original });
  }
  for (const invalid of [{ ...response, requestId: id(301) }, { ...response, identity: { ...identity, memberId: id(302) } },
    { ...response, identity: { ...identity, teamId: id(303) } }, { ...response, identity: { ...identity, userId: id(304) } },
    { ...response, receipt: { ...receipt, commandId: id(305) } }, { ...response, receipt: { ...receipt, setlistId: id(306) } },
    { ...response, receipt: { ...conflict, localValue: { changed: true } } },
    { ...response, receipt: { ...conflict, remote: { ...conflict.remote, snapshot: setlistApplied(command).outcome } } }]) {
    expect(() => assertMobileSetlistCreateReview(request, identity, invalid)).toThrow();
  }
});
it('refuses success, invalid, ID conflicts, target evidence, extra fields and incomplete absence/time', () => {
  const snapshot = setlistApplied(command).outcome;
  for (const invalid of [{ ...response, receipt: setlistApplied(command) },
    ...['invalid', 'command_id_conflict'].map(code => ({ ...response, receipt: { ...common, status: 'rejected', code, message: 'Retained.' } })),
    { ...response, receipt: { ...common, status: 'conflict', ...setlistConflictValues(command), remote: {
      snapshot: snapshot.kind === 'saved' ? snapshot.snapshot : null, template: null, deleteReview: null } } },
    { ...response, targetAbsent: false }, { ...response, checkedAt: 'yesterday' }, { ...response, reserved: true },
    { ...response, receipt: { ...receipt, payloadHash: 'forged' } }]) {
    expect(mobileSetlistCreateReviewResponseSchema.safeParse(invalid).success).toBe(false);
  }
});
