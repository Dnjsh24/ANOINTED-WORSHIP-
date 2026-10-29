import { expect, it } from 'vitest';
import { liveStageRequestSchema, liveStageResponseSchema } from './live-stage';
const id = (number: number) => `97000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const orderedSlotIds = [id(10), id(11)];
it('keeps duplicate-song occurrences distinct and validates exact, bounded ephemeral cursor requests', () => {
  const claim = { action: 'claim', orderedSlotIds, sessionId: id(20), previousSessionId: null, cursor: { slotId: id(11), sectionIndex: 0 } };
  expect(liveStageRequestSchema.parse(claim)).toEqual(claim);
  for (const request of [{ ...claim, orderedSlotIds: [id(10), id(10)] }, { ...claim, previousSessionId: id(20) },
    { ...claim, cursor: { slotId: id(99), sectionIndex: 0 } }, { ...claim, cursor: { slotId: id(10), sectionIndex: 2048 } },
    { ...claim, cursor: { slotId: id(10), sectionIndex: -1 } }, { ...claim, queuedAt: 'never persist' },
    { action: 'publish', orderedSlotIds, sessionId: id(20), sequence: 0, cursor: claim.cursor },
    { action: 'heartbeat', orderedSlotIds, sessionId: id(20), sequence: 1.5 }]) expect(liveStageRequestSchema.safeParse(request).success).toBe(false);
});
it('refuses expired, unbounded or inconsistent lease responses', () => {
  const serverNow = '2026-10-21T00:00:00Z';
  const state = { sessionId: id(20), publisherMemberId: id(3), sequence: 0, orderedSlotIds,
    cursor: { slotId: id(10), sectionIndex: 0 }, expiresAt: '2026-10-21T00:00:25Z' };
  const response = { version: 1, teamId: id(2), setlistId: id(4), serverNow, fenceSessionId: id(20), state };
  expect(liveStageResponseSchema.parse(response)).toEqual(response);
  expect(liveStageResponseSchema.parse({ ...response, state: null }).state).toBeNull();
  for (const change of [{ fenceSessionId: id(99) }, { state: { ...state, expiresAt: serverNow } },
    { state: { ...state, expiresAt: '2026-10-21T00:00:40Z' } }, { state: { ...state, cursor: { slotId: id(99), sectionIndex: 1 } } }]) {
    expect(liveStageResponseSchema.safeParse({ ...response, ...change }).success).toBe(false);
  }
});
