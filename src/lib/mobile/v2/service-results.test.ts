// @vitest-environment node
import { expect, it } from 'vitest';
import { assertMobileServiceResult, serviceConflictValues } from './service-results';
import { id, serviceApplied, serviceEvent, serviceReceiptIdentity as serviceIdentity, serviceOrder } from './service-command-test-fixture';
import type { MobileServiceCommand } from './service-commands';

it('requires actual matching order content, author, team and an advanced revision before accepting a save', () => {
  const command = serviceOrder(); const receipt = serviceApplied(command);
  expect(assertMobileServiceResult(command, serviceIdentity, receipt)).toEqual(receipt);
  if (receipt.outcome.kind !== 'order') throw new Error('Order fixture');
  const savedOrder = receipt.outcome.order;
  for (const change of [{ team_id: id(99) }, { event_id: id(99) }, { updated_by: id(99) }, { revision: command.baseOrder!.revision },
    { entries: [] }, { required_roles: [] }]) expect(() => assertMobileServiceResult(command, serviceIdentity,
    { ...receipt, outcome: { kind: 'order', order: { ...savedOrder, ...change } } })).toThrow();
  expect(() => assertMobileServiceResult(command, serviceIdentity, { ...receipt, commandId: id(99) })).toThrow();
  expect(() => assertMobileServiceResult(command, serviceIdentity, { ...receipt, extraAuthority: true })).toThrow();
});
it('confirms a real proposal submission, including needs-revision, without claiming an applied order', () => {
  const command: MobileServiceCommand = { ...serviceOrder(), type: 'service.order.request', reason: 'Improve timing' };
  const receipt = serviceApplied(command); expect(assertMobileServiceResult(command, serviceIdentity, receipt)).toEqual(receipt);
  if (receipt.outcome.kind !== 'request') throw new Error('Request fixture');
  const request = receipt.outcome.request;
  expect(assertMobileServiceResult(command, serviceIdentity, { ...receipt,
    outcome: { kind: 'request', request: { ...request, status: 'needs_revision', before_snapshot: { entries: [], required_roles: ['New role'] } } } })).toMatchObject({ outcome: { request: { status: 'needs_revision' } } });
  for (const change of [{ requested_by: id(99) }, { team_id: id(99) }, { target_id: id(99) }, { request_nonce: id(99) },
    { base_revision: 9 }, { status: 'approved' }, { changes: {} }, { before_snapshot: {} }, { reviewed_by: id(99) },
    { requested_at: 'invalid' }, { before_snapshot: { entries: [], required_roles: ['Different base'] } }]) {
    expect(() => assertMobileServiceResult(command, serviceIdentity, { ...receipt, outcome: { kind: 'request', request: { ...request, ...change } } })).toThrow();
  }
  expect(() => assertMobileServiceResult(command, serviceIdentity, serviceApplied(serviceOrder()))).toThrow();
});
it('requires assignment identity, own membership and a verified advanced live response version', () => {
  const command: MobileServiceCommand = { commandId: id(80), eventId: id(10), type: 'service.assignment.respond', baseEventRevision: 1,
    dependsOn: [], baseAssignment: { id: id(20), eventId: id(10), memberId: serviceIdentity.memberId, assignment: 'Media' },
    baseResponse: null, responseVersion: { assignmentId: id(20), memberId: serviceIdentity.memberId, revision: 0, deleted: true }, value: { state: 'confirmed', note: 'Ready' } };
  const receipt = serviceApplied(command); expect(assertMobileServiceResult(command, serviceIdentity, receipt)).toEqual(receipt);
  if (receipt.outcome.kind !== 'assignment') throw new Error('Assignment fixture');
  const outcome = receipt.outcome;
  for (const changed of [{ ...outcome, responseVersion: { ...outcome.responseVersion, revision: 0 } },
    { ...outcome, responseVersion: { ...outcome.responseVersion, memberId: id(99) } },
    { ...outcome, responseVersion: { ...outcome.responseVersion, deleted: true } },
    { ...outcome, response: { ...outcome.response, state: 'declined' } },
    { ...outcome, response: { ...outcome.response, sync_revision: 99 } },
    { ...outcome, assignment: { ...outcome.assignment, assignment: 'Changed role' } }]) expect(() => assertMobileServiceResult(command, serviceIdentity, { ...receipt, outcome: changed })).toThrow();
  expect(() => assertMobileServiceResult(command, { ...serviceIdentity, memberId: id(99) }, receipt)).toThrow();
});
it('retains exact conflict versions and rejects mismatched parents or foreign server content', () => {
  const command = serviceOrder();
  const receipt = { commandId: command.commandId, eventId: command.eventId, type: command.type, status: 'conflict', payloadHash: 'b'.repeat(64),
    ...serviceConflictValues(command), remote: { event: serviceEvent().record, order: command.baseOrder, assignment: null, response: null, responseVersion: null } };
  expect(assertMobileServiceResult(command, serviceIdentity, receipt)).toEqual(receipt);
  for (const changed of [{ ...receipt, baseValue: null }, { ...receipt, localValue: {} },
    { ...receipt, remote: { ...receipt.remote, event: { ...receipt.remote.event, team_id: id(99) } } },
    { ...receipt, remote: { ...receipt.remote, event: null } },
    { ...receipt, remote: { ...receipt.remote, order: { ...command.baseOrder, team_id: id(99) } } }]) expect(() => assertMobileServiceResult(command, serviceIdentity, changed)).toThrow();
});
it('allows bounded terminal results only for the matching command type and ID', () => {
  const command = serviceOrder(); const common = { commandId: command.commandId, eventId: command.eventId, type: command.type, payloadHash: 'c'.repeat(64) };
  for (const value of [{ ...common, status: 'rejected', code: 'permission', message: 'Access changed' },
    { ...common, status: 'blocked', code: 'dependency', message: 'Dependency failed' }]) {
    expect(assertMobileServiceResult(command, serviceIdentity, value)).toEqual(value);
    expect(() => assertMobileServiceResult(command, serviceIdentity, { ...value, type: 'service.assignment.respond' })).toThrow();
    expect(() => assertMobileServiceResult(command, serviceIdentity, { ...value, message: 'x'.repeat(251) })).toThrow();
  }
});
