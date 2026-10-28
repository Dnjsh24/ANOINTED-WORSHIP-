import { setlistIdentity as identity, id } from './mobile/v2/setlist-state-test-fixture';
import type { LiveStageRequest, LiveStageResponse } from './domain/live-stage';
export { identity, id };
export const stageSetlistId = id(20);
export const stageSlots = [id(40), id(41)];
export const stageRead: LiveStageRequest = { action: 'read', orderedSlotIds: stageSlots };
export const stagePublish: LiveStageRequest = { action: 'publish', orderedSlotIds: stageSlots, sessionId: id(90), sequence: 2, cursor: { slotId: id(41), sectionIndex: 1 } };
export function stageReply(input: LiveStageRequest = stageRead): LiveStageResponse {
  const sessionId = 'sessionId' in input ? input.sessionId : id(90);
  return { version: 1, teamId: identity.teamId, setlistId: stageSetlistId,
    serverNow: '2026-10-21T00:00:00Z', fenceSessionId: sessionId,
    state: input.action === 'release' ? null : { sessionId, publisherMemberId: identity.memberId,
      sequence: 'sequence' in input ? input.sequence : 0, orderedSlotIds: stageSlots,
      cursor: 'cursor' in input ? input.cursor : { slotId: stageSlots[0], sectionIndex: 0 }, expiresAt: '2026-10-21T00:00:25Z' } };
}
