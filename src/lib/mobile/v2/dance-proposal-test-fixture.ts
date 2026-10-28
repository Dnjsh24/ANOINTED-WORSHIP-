import type { MobileDanceProposalIntent, MobileDanceProposalReceipt, MobileDanceProposalSnapshot } from './dance-proposals';
export const danceProposalId = (n: number) => `99000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = danceProposalId;
export const danceProposalSnapshot: MobileDanceProposalSnapshot = { version: 2, identity: { userId: id(1), teamId: id(2), memberId: id(3), teamName: 'Team', role: 'member', permissions: [] },
  chart: { id: id(4), teamId: id(2), syncRevision: 12, sharedEditRevision: 3, value: { title: 'Dance', song_id: id(5), event_id: null, choreography_notes: 'Verse: right', formation_notes: null,
    outfit_notes: null, song_title: null, song_artist: null, song_version: null, video_url: null } }, fetchedAt: '2026-10-21T04:00:00Z' };
export const danceProposalIntent: MobileDanceProposalIntent = { version: 2, userId: id(1), teamId: id(2), memberId: id(3),
  proposal: { targetType: 'choreography', targetId: id(4), revision: 3, changes: { choreography_notes: 'Verse: left' }, reason: 'Match the new cue', requestNonce: id(6) } };
export const danceProposalReceipt: MobileDanceProposalReceipt = { version: 2, userId: id(1), teamId: id(2), memberId: id(3),
  request: { id: id(7), team_id: id(2), target_type: 'choreography', target_id: id(4), base_revision: 3, changes: danceProposalIntent.proposal.changes,
    before_snapshot: { title: 'Dance', choreography_notes: 'Verse: right' }, after_snapshot: null, reason: 'Match the new cue', status: 'pending', requested_by: id(1), reviewed_by: null,
    review_reason: null, requested_at: '2026-10-21T04:01:00Z', reviewed_at: null, request_nonce: id(6), legacy_song_request_id: null } };
