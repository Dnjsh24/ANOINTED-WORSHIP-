import { mobileEventRowSchema } from './event-read-models';
import { fixture as eventFixture, id, identity as scope } from './event-read-test-fixture';
import { mobileSetlistEditorCacheSchema, mobileSetlistSnapshotSchema } from './setlist-state';
import type { MobileIdentity } from '../contracts';

export { id };
export const setlistIdentity: MobileIdentity = { ...scope, teamName: 'Test team', role: 'owner', permissions: ['setlists.manage', 'attendance.confirm'] };
const time = '2026-10-17T00:00:00Z';
export function setlistSnapshot() {
  return mobileSetlistSnapshotSchema.parse({
    record: { id: id(20), team_id: scope.teamId, name: 'Sunday setlist', setlist_date: '2026-10-18', event_id: id(10),
      location: 'Hall', call_time: '09:00:00', rehearsal_time: '08:00:00', service_times: ['Sunday Worship'], notes: 'Original notes',
      leader_member_id: scope.memberId, presentation_settings: { theme: 'violet', custom: { layout: 'wide' } },
      created_by: scope.userId, created_at: time, updated_at: time, deleted_at: null, sync_revision: 7 },
    slots: [{ id: id(40), setlist_id: id(20), song_id: id(30), song_order: 1, assigned_key: 'G', notes: '{"rehearsalNotes":"Keep rehearsal notes"}',
      band_notes: 'Band cue', arrangement: 'Verse twice', lead_member_id: scope.memberId, youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      slide_settings: { linesPerSlide: 4, nested: { custom: true } }, created_at: time, updated_at: time, deleted_at: null, sync_revision: 2 }],
    linkedEvent: mobileEventRowSchema.parse(eventFixture().events[0]),
  });
}
export function setlistEditorCache() {
  return mobileSetlistEditorCacheSchema.parse({
    version: 2, identity: setlistIdentity, setlists: [setlistSnapshot()], availableEvents: [],
    songs: [{ id: id(30), title: 'Test song', artist: 'Test artist', originalKey: 'C', bpm: 80 }],
  });
}
