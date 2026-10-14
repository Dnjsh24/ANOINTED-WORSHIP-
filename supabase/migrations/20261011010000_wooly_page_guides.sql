-- Extend the local catalog boundary; own-account RLS and terminal-checkpoint trigger stay in place.
-- Apply only after review and separate authorization for the target database.
begin;
alter table public.wooly_tutorial_progress drop constraint wooly_tutorial_valid_step;
alter table public.wooly_tutorial_progress add constraint wooly_tutorial_valid_step check (
  (tour_id = 'joining' and next_step in ('welcome', 'code', 'preview', 'role', 'request'))
  or
  (tour_id = 'creating' and next_step in ('details', 'invites', 'review'))
  or
  (tour_id = 'essentials' and next_step in ('welcome', 'home', 'setlists', 'timeline', 'messages', 'profile', 'finish'))
  or
  (tour_id = 'page-welcome' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-login' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-teams' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-join' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-create' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-pending' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-home' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlists' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-setlist-templates' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-setlist-detail' and next_step in ('step-1', 'step-2', 'step-3', 'step-4'))
  or
  (tour_id = 'page-setlist-add-song' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-practice' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-stage' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-projector' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-confidence' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-songs' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-detail' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-song-trash' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-events' and next_step in ('step-1', 'step-2', 'step-3', 'step-4'))
  or
  (tour_id = 'page-event-new' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-event-edit' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-event-detail' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-messages' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-profile' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-members' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-member-invite' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-member-requests' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-member-detail' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-analytics' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-announcements' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-reminders' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-dance' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-dance-detail' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-dance-edit' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-settings' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-sync' and next_step in ('step-1', 'step-2'))
  or
  (tour_id = 'page-remote' and next_step in ('step-1', 'step-2', 'step-3'))
  or
  (tour_id = 'page-remote-session' and next_step in ('step-1', 'step-2', 'step-3'))
);
commit;
