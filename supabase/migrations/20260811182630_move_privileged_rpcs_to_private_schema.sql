-- Forward-only security boundary change.
-- Rollback requires a new migration that drops these public facades, moves the
-- private implementations back to public, and restores the prior grants.

-- Keep elevated implementations out of the Data API's exposed schema. The
-- public functions recreated below are caller-privilege facades; authorization
-- remains inside the moved implementation functions.
alter function public.add_setlist_songs(uuid, jsonb) set schema private;
alter function public.claim_worship_remote_pairing(uuid, text) set schema private;
alter function public.claim_worship_remote_pairing_by_pin(text) set schema private;
alter function public.create_team_workspace(text, text, text, time, time) set schema private;
alter function public.create_worship_remote_pairing(uuid) set schema private;
alter function public.delete_event_cascade(uuid) set schema private;
alter function public.delete_setlist_cascade(uuid) set schema private;
alter function public.delete_song_cascade(uuid) set schema private;
alter function public.leave_team_workspace(uuid) set schema private;
alter function public.mark_channel_messages_read(uuid, uuid[]) set schema private;
alter function public.reorder_setlist_songs(uuid, jsonb) set schema private;
alter function public.resume_worship_remote_pairing(uuid) set schema private;
alter function public.review_join_request(uuid, text) set schema private;
alter function public.revoke_worship_remote_pairing(uuid) set schema private;
alter function public.transfer_team_ownership(uuid, uuid) set schema private;

-- Pin resolution and make the private execution grants explicit. The private
-- schema is not included in the Data API's exposed schemas.
alter function private.add_setlist_songs(uuid, jsonb) set search_path = '';
alter function private.claim_worship_remote_pairing(uuid, text) set search_path = '';
alter function private.claim_worship_remote_pairing_by_pin(text) set search_path = '';
alter function private.create_team_workspace(text, text, text, time, time) set search_path = '';
alter function private.create_worship_remote_pairing(uuid) set search_path = '';
alter function private.delete_event_cascade(uuid) set search_path = '';
alter function private.delete_setlist_cascade(uuid) set search_path = '';
alter function private.delete_song_cascade(uuid) set search_path = '';
alter function private.leave_team_workspace(uuid) set search_path = '';
alter function private.mark_channel_messages_read(uuid, uuid[]) set search_path = '';
alter function private.reorder_setlist_songs(uuid, jsonb) set search_path = '';
alter function private.resume_worship_remote_pairing(uuid) set search_path = '';
alter function private.review_join_request(uuid, text) set search_path = '';
alter function private.revoke_worship_remote_pairing(uuid) set search_path = '';
alter function private.transfer_team_ownership(uuid, uuid) set search_path = '';

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

revoke all on function private.add_setlist_songs(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.add_setlist_songs(uuid, jsonb) to authenticated;
grant execute on function private.add_setlist_songs(uuid, jsonb) to service_role;

revoke all on function private.claim_worship_remote_pairing(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_worship_remote_pairing(uuid, text) to authenticated;
grant execute on function private.claim_worship_remote_pairing(uuid, text) to service_role;

revoke all on function private.claim_worship_remote_pairing_by_pin(text)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_worship_remote_pairing_by_pin(text) to authenticated;
grant execute on function private.claim_worship_remote_pairing_by_pin(text) to service_role;

revoke all on function private.create_team_workspace(text, text, text, time, time)
  from public, anon, authenticated, service_role;
grant execute on function private.create_team_workspace(text, text, text, time, time) to authenticated;
grant execute on function private.create_team_workspace(text, text, text, time, time) to service_role;

revoke all on function private.create_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.create_worship_remote_pairing(uuid) to authenticated;
grant execute on function private.create_worship_remote_pairing(uuid) to service_role;

revoke all on function private.delete_event_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.delete_event_cascade(uuid) to authenticated;
grant execute on function private.delete_event_cascade(uuid) to service_role;

revoke all on function private.delete_setlist_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.delete_setlist_cascade(uuid) to authenticated;
grant execute on function private.delete_setlist_cascade(uuid) to service_role;

revoke all on function private.delete_song_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.delete_song_cascade(uuid) to authenticated;
grant execute on function private.delete_song_cascade(uuid) to service_role;

revoke all on function private.leave_team_workspace(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.leave_team_workspace(uuid) to authenticated;
grant execute on function private.leave_team_workspace(uuid) to service_role;

revoke all on function private.mark_channel_messages_read(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function private.mark_channel_messages_read(uuid, uuid[]) to authenticated;
grant execute on function private.mark_channel_messages_read(uuid, uuid[]) to service_role;

revoke all on function private.reorder_setlist_songs(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.reorder_setlist_songs(uuid, jsonb) to authenticated;
grant execute on function private.reorder_setlist_songs(uuid, jsonb) to service_role;

revoke all on function private.resume_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.resume_worship_remote_pairing(uuid) to authenticated;
grant execute on function private.resume_worship_remote_pairing(uuid) to service_role;

revoke all on function private.review_join_request(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.review_join_request(uuid, text) to authenticated;
grant execute on function private.review_join_request(uuid, text) to service_role;

revoke all on function private.revoke_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.revoke_worship_remote_pairing(uuid) to authenticated;
grant execute on function private.revoke_worship_remote_pairing(uuid) to service_role;

revoke all on function private.transfer_team_ownership(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.transfer_team_ownership(uuid, uuid) to authenticated;
grant execute on function private.transfer_team_ownership(uuid, uuid) to service_role;

create or replace function public.add_setlist_songs(
  p_setlist_id uuid,
  p_songs jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.add_setlist_songs(p_setlist_id, p_songs);
$$;

create or replace function public.claim_worship_remote_pairing(
  p_session_id uuid,
  p_pairing_code text
)
returns table (
  setlist_id uuid,
  channel_secret text,
  expires_at timestamptz,
  session_id uuid,
  team_id uuid,
  channel_topic text,
  private_channel boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_worship_remote_pairing(p_session_id, p_pairing_code);
$$;

create or replace function public.claim_worship_remote_pairing_by_pin(p_pin_code text)
returns table (
  session_id uuid,
  setlist_id uuid,
  team_id uuid,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean,
  error_code text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_worship_remote_pairing_by_pin(p_pin_code);
$$;

create or replace function public.create_team_workspace(
  p_name text,
  p_code text,
  p_default_service_location text default 'Main Sanctuary',
  p_default_call_time time default '09:00',
  p_default_rehearsal_time time default '08:15'
)
returns table (
  team_id uuid,
  team_member_id uuid,
  channel_id uuid
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_team_workspace(
    p_name,
    p_code,
    p_default_service_location,
    p_default_call_time,
    p_default_rehearsal_time
  );
$$;

create or replace function public.create_worship_remote_pairing(p_setlist_id uuid)
returns table (
  session_id uuid,
  qr_token text,
  pin_code text,
  claim_expires_at timestamptz,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_worship_remote_pairing(p_setlist_id);
$$;

create or replace function public.delete_event_cascade(p_event_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_event_cascade(p_event_id);
$$;

create or replace function public.delete_setlist_cascade(p_setlist_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_setlist_cascade(p_setlist_id);
$$;

create or replace function public.delete_song_cascade(p_song_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_song_cascade(p_song_id);
$$;

create or replace function public.leave_team_workspace(p_team_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.leave_team_workspace(p_team_id);
$$;

create or replace function public.mark_channel_messages_read(
  p_channel_id uuid,
  p_message_ids uuid[]
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.mark_channel_messages_read(p_channel_id, p_message_ids);
$$;

create or replace function public.reorder_setlist_songs(
  p_setlist_id uuid,
  p_updates jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.reorder_setlist_songs(p_setlist_id, p_updates);
$$;

create or replace function public.resume_worship_remote_pairing(p_session_id uuid)
returns table (
  session_id uuid,
  setlist_id uuid,
  team_id uuid,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.resume_worship_remote_pairing(p_session_id);
$$;

create or replace function public.review_join_request(
  p_request_id uuid,
  p_decision text
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.review_join_request(p_request_id, p_decision);
$$;

create or replace function public.revoke_worship_remote_pairing(p_session_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_worship_remote_pairing(p_session_id);
$$;

create or replace function public.transfer_team_ownership(
  p_team_id uuid,
  p_new_owner_member_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.transfer_team_ownership(p_team_id, p_new_owner_member_id);
$$;

revoke all on function public.add_setlist_songs(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.add_setlist_songs(uuid, jsonb) to authenticated;
grant execute on function public.add_setlist_songs(uuid, jsonb) to service_role;

revoke all on function public.claim_worship_remote_pairing(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to authenticated;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to service_role;

revoke all on function public.claim_worship_remote_pairing_by_pin(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_worship_remote_pairing_by_pin(text) to authenticated;
grant execute on function public.claim_worship_remote_pairing_by_pin(text) to service_role;

revoke all on function public.create_team_workspace(text, text, text, time, time)
  from public, anon, authenticated, service_role;
grant execute on function public.create_team_workspace(text, text, text, time, time) to authenticated;
grant execute on function public.create_team_workspace(text, text, text, time, time) to service_role;

revoke all on function public.create_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_worship_remote_pairing(uuid) to authenticated;
grant execute on function public.create_worship_remote_pairing(uuid) to service_role;

revoke all on function public.delete_event_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_event_cascade(uuid) to authenticated;
grant execute on function public.delete_event_cascade(uuid) to service_role;

revoke all on function public.delete_setlist_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_setlist_cascade(uuid) to authenticated;
grant execute on function public.delete_setlist_cascade(uuid) to service_role;

revoke all on function public.delete_song_cascade(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_song_cascade(uuid) to authenticated;
grant execute on function public.delete_song_cascade(uuid) to service_role;

revoke all on function public.leave_team_workspace(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.leave_team_workspace(uuid) to authenticated;
grant execute on function public.leave_team_workspace(uuid) to service_role;

revoke all on function public.mark_channel_messages_read(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.mark_channel_messages_read(uuid, uuid[]) to authenticated;
grant execute on function public.mark_channel_messages_read(uuid, uuid[]) to service_role;

revoke all on function public.reorder_setlist_songs(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.reorder_setlist_songs(uuid, jsonb) to authenticated;
grant execute on function public.reorder_setlist_songs(uuid, jsonb) to service_role;

revoke all on function public.resume_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resume_worship_remote_pairing(uuid) to authenticated;
grant execute on function public.resume_worship_remote_pairing(uuid) to service_role;

revoke all on function public.review_join_request(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_join_request(uuid, text) to authenticated;
grant execute on function public.review_join_request(uuid, text) to service_role;

revoke all on function public.revoke_worship_remote_pairing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_worship_remote_pairing(uuid) to authenticated;
grant execute on function public.revoke_worship_remote_pairing(uuid) to service_role;

revoke all on function public.transfer_team_ownership(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.transfer_team_ownership(uuid, uuid) to authenticated;
grant execute on function public.transfer_team_ownership(uuid, uuid) to service_role;
