// @vitest-environment node
import { expect, it } from 'vitest';
import { mobileEventCacheSchema } from './event-cache';
import { isServiceResponseStateConsistent, mobileServiceAssignmentStateSchema, verifiedServiceResponseVersion } from './service-response-state';
import { id, serviceEvent, serviceIdentity as identity, timestamp } from './service-command-test-fixture';

function event() {
  const value = serviceEvent();
  value.servicePlanning!.ownResponseStates = [{ actor_id: identity.userId, team_id: identity.teamId, event_id: value.id, assignment_id: id(20),
    member_id: identity.memberId, revision: 1, deleted: false, changed_at: timestamp }];
  return value;
}
it('keeps legacy capability unknown even with a saved response or an empty response list', () => {
  const legacy = serviceEvent(); expect(verifiedServiceResponseVersion(legacy, identity, id(20))).toBeUndefined();
  delete legacy.servicePlanning!.responses[0].sync_revision;
  expect(mobileEventCacheSchema.parse({ version: 2, identity, events: [legacy] }).events[0]).toEqual(legacy);
  legacy.servicePlanning!.responses = []; expect(verifiedServiceResponseVersion(legacy, identity, id(20))).toBeUndefined();
});
it('distinguishes verified live, deleted and never-observed own responses', () => {
  const value = event(); expect(verifiedServiceResponseVersion(value, identity, id(20))).toEqual({ assignmentId: id(20), memberId: identity.memberId, revision: 1, deleted: false });
  value.servicePlanning!.responses = []; value.servicePlanning!.ownResponseStates![0] = { ...value.servicePlanning!.ownResponseStates![0], deleted: true, revision: 4 };
  expect(verifiedServiceResponseVersion(value, identity, id(20))).toMatchObject({ revision: 4, deleted: true });
  value.servicePlanning!.ownResponseStates = []; expect(verifiedServiceResponseVersion(value, identity, id(20))).toMatchObject({ revision: 0, deleted: true });
  expect(() => verifiedServiceResponseVersion(value, identity, id(99))).toThrow(/unavailable/);
});
it('rejects mixed live/tombstone revisions, missing state and duplicate rows instead of assigning a guessed base', () => {
  const cases: ((value: ReturnType<typeof event>) => void)[] = [
    value => { value.servicePlanning!.ownResponseStates![0].revision = 2; },
    value => { value.servicePlanning!.ownResponseStates![0].deleted = true; },
    value => { value.servicePlanning!.ownResponseStates = []; },
    value => { value.servicePlanning!.responses = []; },
    value => { delete value.servicePlanning!.responses[0].sync_revision; },
    value => { value.servicePlanning!.responses.push({ ...value.servicePlanning!.responses[0] }); },
    value => { value.servicePlanning!.ownResponseStates!.push({ ...value.servicePlanning!.ownResponseStates![0] }); },
    value => { value.assignments = []; },
  ];
  for (const change of cases) {
    const value = event(); change(value); expect(isServiceResponseStateConsistent(value, identity)).toBe(false);
    expect(mobileEventCacheSchema.safeParse({ version: 2, identity, events: [value] }).success).toBe(false);
    expect(() => verifiedServiceResponseVersion(value, identity, id(20))).toThrow();
  }
});
it('checks all scope fields and permits only deleted history for assignments no longer present', () => {
  for (const change of [{ actor_id: id(99) }, { team_id: id(99) }, { member_id: id(99) }, { event_id: id(99) }]) {
    const value = event(); Object.assign(value.servicePlanning!.ownResponseStates![0], change);
    expect(mobileEventCacheSchema.safeParse({ version: 2, identity, events: [value] }).success).toBe(false);
  }
  const value = event(); value.servicePlanning!.ownResponseStates!.push({ ...value.servicePlanning!.ownResponseStates![0], assignment_id: id(99), deleted: true, revision: 3 });
  expect(isServiceResponseStateConsistent(value, identity)).toBe(true);
  value.servicePlanning!.ownResponseStates![1].deleted = false; expect(isServiceResponseStateConsistent(value, identity)).toBe(false);
});
it('retains a prior-event tombstone only for a current own assignment and never treats it as a live response', () => {
  const value = event(); value.servicePlanning!.responses = [];
  value.servicePlanning!.ownResponseStates![0] = { ...value.servicePlanning!.ownResponseStates![0], event_id: id(99), deleted: true, revision: 4 };
  expect(verifiedServiceResponseVersion(value, identity, id(20))).toMatchObject({ revision: 4, deleted: true });
  expect(mobileEventCacheSchema.safeParse({ version: 2, identity, events: [value] }).success).toBe(true);
  value.servicePlanning!.ownResponseStates![0].deleted = false; expect(isServiceResponseStateConsistent(value, identity)).toBe(false);
  value.servicePlanning!.ownResponseStates![0].deleted = true; value.assignments = [];
  expect(isServiceResponseStateConsistent(value, identity)).toBe(false);
});
it('bounds the durable state and refuses forged response parents in a verified cache', () => {
  const state = event().servicePlanning!.ownResponseStates![0];
  for (const value of [{ ...state, revision: 0 }, { ...state, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...state, changed_at: 'bad' }, { ...state, extra: true }]) expect(mobileServiceAssignmentStateSchema.safeParse(value).success).toBe(false);
  const value = event(); value.servicePlanning!.responses[0].team_member_id = id(99);
  expect(mobileEventCacheSchema.safeParse({ version: 2, identity, events: [value] }).success).toBe(false);
});
