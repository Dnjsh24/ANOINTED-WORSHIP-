import { identity, id } from './live-stage-test-fixture';
import { mobileDanceProposalSnapshotSchema, mobileDanceProposalRequestSchema, mobileDanceProposalReceiptSchema } from './mobile/v2/dance-proposals';
export { identity, id };
export const chartId = id(77);
export const snapshot = mobileDanceProposalSnapshotSchema.parse({ version: 2, identity,
  chart: { id: chartId, teamId: identity.teamId, syncRevision: 7, sharedEditRevision: 3, value: { title: 'Original Dance', song_id: null, event_id: null,
    choreography_notes: 'Verse steps', formation_notes: null, outfit_notes: null, song_title: null, song_artist: null, song_version: null, video_url: null } }, fetchedAt: '2026-10-21T00:00:00Z' });
export const proposalRequest = mobileDanceProposalRequestSchema.parse({ version: 2, intent: { version: 2, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId,
  proposal: { targetType: 'choreography', targetId: chartId, revision: 3, changes: { title: 'Proposed Dance' }, reason: 'Correct the title.', requestNonce: id(99) } } });
export const receipt = mobileDanceProposalReceiptSchema.parse({ version: 2, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId,
  request: { id: id(98), team_id: identity.teamId, target_type: 'choreography', target_id: chartId, base_revision: 3, changes: proposalRequest.intent.proposal.changes,
    before_snapshot: snapshot.chart.value, after_snapshot: null, reason: proposalRequest.intent.proposal.reason, status: 'pending', requested_by: identity.userId,
    reviewed_by: null, review_reason: null, requested_at: '2026-10-21T00:00:00Z', reviewed_at: null, request_nonce: proposalRequest.intent.proposal.requestNonce, legacy_song_request_id: null } });
