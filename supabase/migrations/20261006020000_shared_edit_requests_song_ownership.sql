-- Apply after the atomic workspace migration. Existing published content and
-- legacy song requests remain intact; unknown historical revisions require resubmission.
alter table public.announcements add column shared_edit_revision bigint not null default 0;
alter table public.notifications add column shared_edit_revision bigint not null default 0;
alter table public.dance_notes add column shared_edit_revision bigint not null default 0;

create table public.shared_edit_requests (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 target_type text not null check (target_type in ('song','setlist','event','song_slot','announcement','reminder','choreography')),
 target_id uuid not null, base_revision bigint not null check (base_revision between 0 and 9007199254740991), changes jsonb not null,
 before_snapshot jsonb not null, after_snapshot jsonb,
 reason text not null check (length(trim(reason)) between 1 and 1000),
 status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','needs_revision')),
 requested_by uuid not null references public.profiles(id), reviewed_by uuid references public.profiles(id),
 review_reason text check (length(review_reason) <= 1000), requested_at timestamptz not null default now(), reviewed_at timestamptz,
 request_nonce uuid not null, legacy_song_request_id uuid unique references public.song_edit_requests(id) on delete set null,
 unique (requested_by,request_nonce), check (jsonb_typeof(changes)='object' and octet_length(changes::text) <= 262144),
 check (status not in ('approved','rejected') or (reviewed_by is not null and reviewed_at is not null and reviewed_by <> requested_by))
);
create index shared_edit_requests_team_queue_idx on public.shared_edit_requests(team_id,status,requested_at desc);
create index shared_edit_requests_requester_idx on public.shared_edit_requests(requested_by,requested_at desc);
create index shared_edit_requests_target_idx on public.shared_edit_requests(target_type,target_id);
alter table public.shared_edit_requests enable row level security;
revoke all on public.shared_edit_requests from public,anon,authenticated;
grant select on public.shared_edit_requests to authenticated;

create function private.shared_edit_permission(p_type text) returns text language sql immutable set search_path='' as $$
 select case p_type when 'song' then 'songs.review' when 'setlist' then 'setlists.manage' when 'event' then 'events.manage' when 'song_slot' then 'setlists.manage' when 'announcement' then 'announcements.create' when 'reminder' then 'members.manage' when 'choreography' then 'dance_notes.review' else null end;
$$;
create function private.can_review_shared_edit(p_team uuid,p_type text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_approved_member(p_team) and case when p_type='song' then private.has_team_role(p_team,array['owner','admin']::public.team_role[])
 else private.has_workspace_permission(p_team,private.shared_edit_permission(p_type)) or
 private.has_team_role(p_team,case private.shared_edit_permission(p_type) when 'announcements.create' then array['owner','admin','pastor','worship_leader']::public.team_role[]
 when 'members.manage' then array['owner','admin']::public.team_role[] when 'dance_notes.review' then array['owner','admin']::public.team_role[] else '{}'::public.team_role[] end)
 or exists (select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
 where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and private.shared_edit_permission(p_type)=any(cr.permissions)) end;
$$;
create function private.can_read_shared_target(p_type text,p_id uuid,p_team uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_approved_member(p_team) then return false; end if;
 if p_type='announcement' then return exists(select 1 from public.announcements a where a.id=p_id and a.team_id=p_team and (
 (a.target_role is null and a.target_profile_id is null) or a.target_profile_id=auth.uid() or private.can_review_shared_edit(p_team,p_type)
 or exists(select 1 from public.team_members tm where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and tm.role=a.target_role)));
 elsif p_type='reminder' then return exists(select 1 from public.notifications n where n.notice_group_id=p_id and n.team_id=p_team
 and (n.profile_id=auth.uid() or private.can_review_shared_edit(p_team,p_type)))
 and not exists(select 1 from public.notifications n where n.notice_group_id=p_id and n.team_id<>p_team);
 end if;
 return p_type in ('song','setlist','event','song_slot','choreography');
end;
$$;
revoke all on function private.shared_edit_permission(text),private.can_review_shared_edit(uuid,text),private.can_read_shared_target(text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_review_shared_edit(uuid,text),private.can_read_shared_target(text,uuid,uuid) to authenticated;
create policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests for select to authenticated using (
 private.can_read_shared_target(target_type,target_id,team_id) and (requested_by=auth.uid() or private.can_review_shared_edit(team_id,target_type))
);

create function private.validate_shared_edit_changes(p_type text,p_changes jsonb) returns void language plpgsql set search_path='' as $$
declare v_keys text[]; v_item jsonb; v_key text;
begin
 if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or octet_length(p_changes::text)>262144 then raise exception 'Invalid proposal' using errcode='22023'; end if;
 v_keys := case p_type when 'song' then array['title','artist','original_key','bpm','time_signature','lyrics_chords','youtube_url','spotify_url','image_url','album','tags']::text[]
 when 'setlist' then array['name','setlist_date','location','call_time','rehearsal_time','service_times','notes','leader_member_id','song_ids']::text[]
 when 'event' then array['name','type','event_date','starts_at','ends_at','location','description','rehearsal_date','rehearsal_time','rehearsal_end_time','assignments']::text[]
 when 'song_slot' then array['notes','band_notes','arrangement','assigned_key','lead_member_id','youtube_url']::text[]
 when 'announcement' then array['title','body','category','priority','is_pinned']::text[]
 when 'reminder' then array['title','body','priority']::text[]
 when 'choreography' then array['title','choreography_notes','formation_notes','outfit_notes','song_title','song_artist','song_version','video_url']::text[] else null end;
 if v_keys is null or exists(select 1 from jsonb_object_keys(p_changes) key where not(key=any(v_keys))) then raise exception 'Unsupported proposal fields' using errcode='22023'; end if;
 case p_type
 when 'song' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'artist'  and (jsonb_typeof(p_changes->'artist')<>'string' or length(p_changes->>'artist')>160 or length(trim(p_changes->>'artist'))=0) then raise exception 'Invalid artist' using errcode='22023'; end if;
  if p_changes ? 'original_key'  and (jsonb_typeof(p_changes->'original_key')<>'string' or length(p_changes->>'original_key')>3 or length(trim(p_changes->>'original_key'))=0) then raise exception 'Invalid original_key' using errcode='22023'; end if;
  if p_changes ? 'bpm' and p_changes->'bpm'<>'null'::jsonb and (jsonb_typeof(p_changes->'bpm')<>'number' or (p_changes->>'bpm')::numeric not between 40 and 240 or (p_changes->>'bpm')::numeric<>trunc((p_changes->>'bpm')::numeric)) then raise exception 'Invalid bpm' using errcode='22023'; end if;
  if p_changes ? 'time_signature'  and (jsonb_typeof(p_changes->'time_signature')<>'string' or length(p_changes->>'time_signature')>5) then raise exception 'Invalid time_signature' using errcode='22023'; end if;
  if p_changes ? 'lyrics_chords'  and (jsonb_typeof(p_changes->'lyrics_chords')<>'string' or length(p_changes->>'lyrics_chords')>20000 or length(trim(p_changes->>'lyrics_chords'))=0) then raise exception 'Invalid lyrics_chords' using errcode='22023'; end if;
  if p_changes ? 'youtube_url' and p_changes->'youtube_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'youtube_url')<>'string' or length(p_changes->>'youtube_url')>500) then raise exception 'Invalid youtube_url' using errcode='22023'; end if;
  if p_changes ? 'spotify_url' and p_changes->'spotify_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'spotify_url')<>'string' or length(p_changes->>'spotify_url')>500) then raise exception 'Invalid spotify_url' using errcode='22023'; end if;
  if p_changes ? 'image_url' and p_changes->'image_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'image_url')<>'string' or length(p_changes->>'image_url')>500) then raise exception 'Invalid image_url' using errcode='22023'; end if;
  if p_changes ? 'album' and p_changes->'album'<>'null'::jsonb and (jsonb_typeof(p_changes->'album')<>'string' or length(p_changes->>'album')>160) then raise exception 'Invalid album' using errcode='22023'; end if;
  if p_changes ? 'tags'  and (jsonb_typeof(p_changes->'tags')<>'array' or jsonb_array_length(p_changes->'tags')>30) then raise exception 'Invalid tags' using errcode='22023'; end if;
 when 'setlist' then
  if p_changes ? 'name'  and (jsonb_typeof(p_changes->'name')<>'string' or length(p_changes->>'name')>160 or length(trim(p_changes->>'name'))=0) then raise exception 'Invalid name' using errcode='22023'; end if;
  if p_changes ? 'setlist_date'  and (jsonb_typeof(p_changes->'setlist_date')<>'string' or p_changes->>'setlist_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid setlist_date' using errcode='22023'; end if;
  if p_changes ? 'location' and p_changes->'location'<>'null'::jsonb and (jsonb_typeof(p_changes->'location')<>'string' or length(p_changes->>'location')>160) then raise exception 'Invalid location' using errcode='22023'; end if;
  if p_changes ? 'call_time' and p_changes->'call_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'call_time')<>'string' or p_changes->>'call_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid call_time' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_time' and p_changes->'rehearsal_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_time')<>'string' or p_changes->>'rehearsal_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_time' using errcode='22023'; end if;
  if p_changes ? 'service_times'  and (jsonb_typeof(p_changes->'service_times')<>'array' or jsonb_array_length(p_changes->'service_times')>20) then raise exception 'Invalid service_times' using errcode='22023'; end if;
  if p_changes ? 'notes' and p_changes->'notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'notes')<>'string' or length(p_changes->>'notes')>2000) then raise exception 'Invalid notes' using errcode='22023'; end if;
  if p_changes ? 'leader_member_id' and p_changes->'leader_member_id'<>'null'::jsonb and (jsonb_typeof(p_changes->'leader_member_id')<>'string' or p_changes->>'leader_member_id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid leader_member_id' using errcode='22023'; end if;
  if p_changes ? 'song_ids'  and (jsonb_typeof(p_changes->'song_ids')<>'array' or jsonb_array_length(p_changes->'song_ids')>200) then raise exception 'Invalid song_ids' using errcode='22023'; end if;
 when 'event' then
  if p_changes ? 'name'  and (jsonb_typeof(p_changes->'name')<>'string' or length(p_changes->>'name')>160 or length(trim(p_changes->>'name'))=0) then raise exception 'Invalid name' using errcode='22023'; end if;
  if p_changes ? 'type'  and (jsonb_typeof(p_changes->'type')<>'string' or length(p_changes->>'type')>30) then raise exception 'Invalid type' using errcode='22023'; end if;
  if p_changes ? 'event_date'  and (jsonb_typeof(p_changes->'event_date')<>'string' or p_changes->>'event_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid event_date' using errcode='22023'; end if;
  if p_changes ? 'starts_at'  and (jsonb_typeof(p_changes->'starts_at')<>'string' or p_changes->>'starts_at'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid starts_at' using errcode='22023'; end if;
  if p_changes ? 'ends_at' and p_changes->'ends_at'<>'null'::jsonb and (jsonb_typeof(p_changes->'ends_at')<>'string' or p_changes->>'ends_at'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid ends_at' using errcode='22023'; end if;
  if p_changes ? 'location' and p_changes->'location'<>'null'::jsonb and (jsonb_typeof(p_changes->'location')<>'string' or length(p_changes->>'location')>160) then raise exception 'Invalid location' using errcode='22023'; end if;
  if p_changes ? 'description' and p_changes->'description'<>'null'::jsonb and (jsonb_typeof(p_changes->'description')<>'string' or length(p_changes->>'description')>2000) then raise exception 'Invalid description' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_date' and p_changes->'rehearsal_date'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_date')<>'string' or p_changes->>'rehearsal_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid rehearsal_date' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_time' and p_changes->'rehearsal_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_time')<>'string' or p_changes->>'rehearsal_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_time' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_end_time' and p_changes->'rehearsal_end_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_end_time')<>'string' or p_changes->>'rehearsal_end_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_end_time' using errcode='22023'; end if;
  if p_changes ? 'assignments'  and (jsonb_typeof(p_changes->'assignments')<>'array' or jsonb_array_length(p_changes->'assignments')>100) then raise exception 'Invalid assignments' using errcode='22023'; end if;
  if p_changes ? 'assignments' then
   for v_item in select value from jsonb_array_elements(p_changes->'assignments') loop
    if jsonb_typeof(v_item)<>'object' or v_item-array['team_member_id','assignment']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'team_member_id'),'')<>'string'
     or coalesce(jsonb_typeof(v_item->'assignment'),'')<>'string' or v_item->>'assignment' not in ('Worship Leader','Acoustic Guitar','Electric Guitar','Bass','Drums','Main Keys','Second Keys','Band Member','Backup Singer','Media','Dancers') then raise exception 'Invalid assignment proposal' using errcode='22023'; end if;
    perform (v_item->>'team_member_id')::uuid;
   end loop;
   if (select count(*)<>count(distinct (a->>'team_member_id',a->>'assignment')) from jsonb_array_elements(p_changes->'assignments') a) then raise exception 'Duplicate assignment' using errcode='22023'; end if;
  end if;
 when 'song_slot' then
  if p_changes ? 'notes' and p_changes->'notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'notes')<>'string' or length(p_changes->>'notes')>2000) then raise exception 'Invalid notes' using errcode='22023'; end if;
  if p_changes ? 'band_notes' and p_changes->'band_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'band_notes')<>'string' or length(p_changes->>'band_notes')>4000) then raise exception 'Invalid band_notes' using errcode='22023'; end if;
  if p_changes ? 'arrangement' and p_changes->'arrangement'<>'null'::jsonb and (jsonb_typeof(p_changes->'arrangement')<>'string' or length(p_changes->>'arrangement')>4000) then raise exception 'Invalid arrangement' using errcode='22023'; end if;
  if p_changes ? 'assigned_key'  and (jsonb_typeof(p_changes->'assigned_key')<>'string' or length(p_changes->>'assigned_key')>3 or length(trim(p_changes->>'assigned_key'))=0) then raise exception 'Invalid assigned_key' using errcode='22023'; end if;
  if p_changes ? 'lead_member_id' and p_changes->'lead_member_id'<>'null'::jsonb and (jsonb_typeof(p_changes->'lead_member_id')<>'string' or p_changes->>'lead_member_id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid lead_member_id' using errcode='22023'; end if;
  if p_changes ? 'youtube_url' and p_changes->'youtube_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'youtube_url')<>'string' or length(p_changes->>'youtube_url')>500) then raise exception 'Invalid youtube_url' using errcode='22023'; end if;
 when 'announcement' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'body'  and (jsonb_typeof(p_changes->'body')<>'string' or length(p_changes->>'body')>3000 or length(trim(p_changes->>'body'))=0) then raise exception 'Invalid body' using errcode='22023'; end if;
  if p_changes ? 'category'  and (jsonb_typeof(p_changes->'category')<>'string' or length(p_changes->>'category')>80 or length(trim(p_changes->>'category'))=0) then raise exception 'Invalid category' using errcode='22023'; end if;
  if p_changes ? 'priority'  and (jsonb_typeof(p_changes->'priority')<>'string' or length(p_changes->>'priority')>10) then raise exception 'Invalid priority' using errcode='22023'; end if;
  if p_changes ? 'is_pinned'  and (jsonb_typeof(p_changes->'is_pinned')<>'boolean') then raise exception 'Invalid is_pinned' using errcode='22023'; end if;
 when 'reminder' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'body' and p_changes->'body'<>'null'::jsonb and (jsonb_typeof(p_changes->'body')<>'string' or length(p_changes->>'body')>2000) then raise exception 'Invalid body' using errcode='22023'; end if;
  if p_changes ? 'priority'  and (jsonb_typeof(p_changes->'priority')<>'string' or length(p_changes->>'priority')>10) then raise exception 'Invalid priority' using errcode='22023'; end if;
 when 'choreography' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'choreography_notes'  and (jsonb_typeof(p_changes->'choreography_notes')<>'string' or length(p_changes->>'choreography_notes')>6000 or length(trim(p_changes->>'choreography_notes'))=0) then raise exception 'Invalid choreography_notes' using errcode='22023'; end if;
  if p_changes ? 'formation_notes' and p_changes->'formation_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'formation_notes')<>'string' or length(p_changes->>'formation_notes')>3000) then raise exception 'Invalid formation_notes' using errcode='22023'; end if;
  if p_changes ? 'outfit_notes' and p_changes->'outfit_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'outfit_notes')<>'string' or length(p_changes->>'outfit_notes')>2000) then raise exception 'Invalid outfit_notes' using errcode='22023'; end if;
  if p_changes ? 'song_title' and p_changes->'song_title'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_title')<>'string' or length(p_changes->>'song_title')>160) then raise exception 'Invalid song_title' using errcode='22023'; end if;
  if p_changes ? 'song_artist' and p_changes->'song_artist'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_artist')<>'string' or length(p_changes->>'song_artist')>160) then raise exception 'Invalid song_artist' using errcode='22023'; end if;
  if p_changes ? 'song_version' and p_changes->'song_version'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_version')<>'string' or length(p_changes->>'song_version')>160) then raise exception 'Invalid song_version' using errcode='22023'; end if;
  if p_changes ? 'video_url' and p_changes->'video_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'video_url')<>'string' or length(p_changes->>'video_url')>500) then raise exception 'Invalid video_url' using errcode='22023'; end if;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
 if p_changes ? 'priority' and p_changes->>'priority' not in ('normal','important','urgent') then raise exception 'Invalid priority' using errcode='22023'; end if;
 if p_type='song' and p_changes ? 'time_signature' and p_changes->>'time_signature' !~ '^[0-9]{1,2}/[0-9]{1,2}$' then raise exception 'Invalid time signature' using errcode='22023'; end if;
 if p_type='event' and p_changes ? 'type' and p_changes->>'type' not in ('service','rehearsal','meeting','special_event','service_rehearsal') then raise exception 'Invalid event type' using errcode='22023'; end if;
 foreach v_key in array array['tags','service_times','song_ids'] loop
  if p_changes ? v_key then
   for v_item in select value from jsonb_array_elements(p_changes->v_key) loop
    if jsonb_typeof(v_item)<>'string' or (v_key<>'song_ids' and length(v_item#>>'{}')>80)
     or (v_key='tags' and length(trim(v_item#>>'{}'))=0)
     or (v_key='song_ids' and v_item#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid array item' using errcode='22023'; end if;
   end loop;
  end if;
 end loop;
 foreach v_key in array array['setlist_date','event_date','rehearsal_date'] loop
  if p_changes ? v_key and p_changes->v_key<>'null'::jsonb then perform (p_changes->>v_key)::date; end if;
 end loop;
end;
$$;
revoke all on function private.validate_shared_edit_changes(text,jsonb) from public,anon,authenticated;

create function private.shared_edit_target(p_type text,p_id uuid,p_lock boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_team uuid; v_revision bigint; v_values jsonb;
begin
 case p_type
 when 'song' then

  if p_lock then perform 1 from public.songs where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.songs t where t.id=p_id and t.deleted_at is null and t.status='approved';
 when 'setlist' then

  if p_lock then perform 1 from public.setlists where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.setlists t where t.id=p_id and t.deleted_at is null ;
 when 'event' then

  if p_lock then perform 1 from public.events where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.events t where t.id=p_id and t.deleted_at is null and t.approval_status='approved';
 when 'song_slot' then
  if p_lock then perform 1 from public.setlists sl join public.setlist_songs ss on ss.setlist_id=sl.id where ss.id=p_id for update of sl; end if;
  if p_lock then perform 1 from public.setlist_songs where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.setlist_songs t where t.id=p_id and t.deleted_at is null ;
 when 'announcement' then

  if p_lock then perform 1 from public.announcements where id=p_id for update; end if;
  select to_jsonb(t),t.shared_edit_revision into v_row,v_revision from public.announcements t where t.id=p_id  ;
 when 'reminder' then
  if p_lock then perform 1 from public.notifications where notice_group_id=p_id order by id for update; end if;
  select to_jsonb(n), (select sum(shared_edit_revision) from public.notifications where notice_group_id=p_id) into v_row,v_revision from public.notifications n where n.notice_group_id=p_id order by n.id limit 1;
 when 'choreography' then

  if p_lock then perform 1 from public.dance_notes where id=p_id for update; end if;
  select to_jsonb(t),t.shared_edit_revision into v_row,v_revision from public.dance_notes t where t.id=p_id  ;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
 if v_row is null then raise exception 'Target is unavailable' using errcode='42501'; end if;
 if p_type='song_slot' then select team_id into v_team from public.setlists where id=(v_row->>'setlist_id')::uuid and deleted_at is null;
 else v_team:=(v_row->>'team_id')::uuid; end if;
 if auth.uid() is null or v_team is null or not private.can_read_shared_target(p_type,p_id,v_team) then raise exception 'Target is unavailable' using errcode='42501'; end if;
 v_values:='{}'::jsonb;
 case p_type
 when 'song' then v_values:=jsonb_build_object('title',v_row->'title','artist',v_row->'artist','original_key',v_row->'original_key','bpm',v_row->'bpm','time_signature',v_row->'time_signature','lyrics_chords',v_row->'lyrics_chords','youtube_url',v_row->'youtube_url','spotify_url',v_row->'spotify_url','image_url',v_row->'image_url','album',v_row->'album','tags',v_row->'tags');
 when 'setlist' then v_values:=jsonb_build_object('name',v_row->'name','setlist_date',v_row->'setlist_date','location',v_row->'location','call_time',v_row->'call_time','rehearsal_time',v_row->'rehearsal_time','service_times',v_row->'service_times','notes',v_row->'notes','leader_member_id',v_row->'leader_member_id');
 v_values:=v_values || jsonb_build_object('song_ids',coalesce((select jsonb_agg(song_id order by song_order) from public.setlist_songs where setlist_id=p_id and deleted_at is null),'[]'::jsonb));
 when 'event' then v_values:=jsonb_build_object('name',v_row->'name','type',v_row->'type','event_date',v_row->'event_date','starts_at',v_row->'starts_at','ends_at',v_row->'ends_at','location',v_row->'location','description',v_row->'description','rehearsal_date',v_row->'rehearsal_date','rehearsal_time',v_row->'rehearsal_time','rehearsal_end_time',v_row->'rehearsal_end_time');
 v_values:=v_values || jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('team_member_id',team_member_id,'assignment',assignment) order by assignment,team_member_id) from public.event_assignments where event_id=p_id),'[]'::jsonb));
 when 'song_slot' then v_values:=jsonb_build_object('notes',v_row->'notes','band_notes',v_row->'band_notes','arrangement',v_row->'arrangement','assigned_key',v_row->'assigned_key','lead_member_id',v_row->'lead_member_id','youtube_url',v_row->'youtube_url');
 when 'announcement' then v_values:=jsonb_build_object('title',v_row->'title','body',v_row->'body','category',v_row->'category','priority',v_row->'priority','is_pinned',v_row->'is_pinned');
 when 'reminder' then v_values:=jsonb_build_object('title',v_row->'title','body',v_row->'body','priority',v_row->'priority');
 when 'choreography' then v_values:=jsonb_build_object('title',v_row->'title','choreography_notes',v_row->'choreography_notes','formation_notes',v_row->'formation_notes','outfit_notes',v_row->'outfit_notes','song_title',v_row->'song_title','song_artist',v_row->'song_artist','song_version',v_row->'song_version','video_url',v_row->'video_url');
 else null; end case;
 return jsonb_build_object('team_id',v_team,'revision',v_revision,'values',v_values);
end;
$$;
revoke all on function private.shared_edit_target(text,uuid,boolean) from public,anon,authenticated;

create function private.apply_shared_edit(p_type text,p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_setlist public.setlists%rowtype; v_event public.events%rowtype;
begin
 case p_type
 when 'setlist' then
  select * into v_setlist from public.setlists where id=p_id;
  perform public.save_setlist_workspace(v_setlist.team_id,p_id,null,p_values || jsonb_build_object('update_event',false,'event_type',coalesce((select type::text from public.events where id=v_setlist.event_id),'service')),
    array(select jsonb_array_elements_text(p_values->'song_ids')::uuid),null,v_setlist.sync_revision);
 when 'event' then
  select * into v_event from public.events where id=p_id;
  perform public.save_event_workspace(v_event.team_id,p_id,p_values,p_values->'assignments',null,v_event.sync_revision);
 when 'song' then

 update public.songs t set title=r.title,artist=r.artist,original_key=r.original_key,bpm=r.bpm,time_signature=r.time_signature,lyrics_chords=r.lyrics_chords,youtube_url=r.youtube_url,spotify_url=r.spotify_url,image_url=r.image_url,album=r.album,tags=r.tags from jsonb_populate_record(null::public.songs,p_values) r where t.id=p_id;
 when 'song_slot' then
 select sl.team_id into v_team from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id where ss.id=p_id; if p_values->>'lead_member_id' is not null then perform private.validate_event_assignment_payload(v_team,jsonb_build_array(jsonb_build_object('team_member_id',p_values->>'lead_member_id','assignment','Worship Leader'))); end if;
 update public.setlist_songs t set notes=r.notes,band_notes=r.band_notes,arrangement=r.arrangement,assigned_key=r.assigned_key,lead_member_id=r.lead_member_id,youtube_url=r.youtube_url from jsonb_populate_record(null::public.setlist_songs,p_values) r where t.id=p_id;
 when 'announcement' then

 update public.announcements t set title=r.title,body=r.body,category=r.category,priority=r.priority,is_pinned=r.is_pinned from jsonb_populate_record(null::public.announcements,p_values) r where t.id=p_id;
 when 'reminder' then
  select team_id into v_team from public.notifications where notice_group_id=p_id order by id limit 1;
  update public.notifications t set title=r.title,body=r.body,priority=r.priority from jsonb_populate_record(null::public.notifications,p_values) r where t.notice_group_id=p_id and t.team_id=v_team;
 when 'choreography' then

 update public.dance_notes t set title=r.title,choreography_notes=r.choreography_notes,formation_notes=r.formation_notes,outfit_notes=r.outfit_notes,song_title=r.song_title,song_artist=r.song_artist,song_version=r.song_version,video_url=r.video_url from jsonb_populate_record(null::public.dance_notes,p_values) r where t.id=p_id;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
end;
$$;
revoke all on function private.apply_shared_edit(text,uuid,jsonb) from public,anon,authenticated;

create function public.submit_shared_edit_request(p_target_type text,p_target_id uuid,p_revision bigint,p_changes jsonb,p_reason text,p_request_nonce uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_target jsonb; v_existing public.shared_edit_requests%rowtype; v_id uuid; v_team uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_request_nonce is null or p_revision is null or p_revision not between 0 and 9007199254740991 or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Invalid request' using errcode='22023'; end if;
 perform private.validate_shared_edit_changes(p_target_type,p_changes);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_nonce::text,0));
 select * into v_existing from public.shared_edit_requests where requested_by=auth.uid() and request_nonce=p_request_nonce;
 if v_existing.id is not null then
  if v_existing.target_type<>p_target_type or v_existing.target_id<>p_target_id or v_existing.base_revision<>p_revision or v_existing.changes<>p_changes or v_existing.reason<>trim(p_reason) then raise exception 'Request nonce was already used' using errcode='22023'; end if;
  if not private.can_read_shared_target(p_target_type,p_target_id,v_existing.team_id) then raise exception 'Target is unavailable' using errcode='42501'; end if;
  return v_existing.id;
 end if;
 v_target:=private.shared_edit_target(p_target_type,p_target_id,true); v_team:=(v_target->>'team_id')::uuid;
 insert into public.shared_edit_requests(team_id,target_type,target_id,base_revision,changes,before_snapshot,reason,requested_by,request_nonce,status)
 values(v_team,p_target_type,p_target_id,p_revision,p_changes,v_target->'values',trim(p_reason),auth.uid(),p_request_nonce,
 case when (v_target->>'revision')::bigint=p_revision then 'pending' else 'needs_revision' end) returning id into v_id;
 insert into public.notifications(team_id,profile_id,title,body,target_path,created_by)
 select v_team,tm.profile_id,'Shared edit request','A member submitted a shared-content proposal.','/requests',auth.uid()
 from public.team_members tm where tm.team_id=v_team and tm.status='active' and tm.profile_id<>auth.uid()
 and case when p_target_type='song' then tm.role in ('owner','admin')
 else tm.role in ('owner','admin') or tm.role in (case private.shared_edit_permission(p_target_type)
 when 'events.manage' then 'pastor'::public.team_role when 'announcements.create' then 'pastor'::public.team_role else 'owner'::public.team_role end,
 case private.shared_edit_permission(p_target_type) when 'events.manage' then 'worship_leader'::public.team_role when 'setlists.manage' then 'worship_leader'::public.team_role when 'announcements.create' then 'worship_leader'::public.team_role else 'owner'::public.team_role end,
 case private.shared_edit_permission(p_target_type) when 'setlists.manage' then 'band_leader'::public.team_role else 'owner'::public.team_role end)
 or exists(select 1 from public.custom_roles cr where cr.id=tm.custom_role_id and cr.team_id=tm.team_id and private.shared_edit_permission(p_target_type)=any(cr.permissions)) end;
 return v_id;
end;
$$;
revoke all on function public.submit_shared_edit_request(text,uuid,bigint,jsonb,text,uuid) from public,anon;
grant execute on function public.submit_shared_edit_request(text,uuid,bigint,jsonb,text,uuid) to authenticated;

create function public.review_shared_edit_request(p_request_id uuid,p_decision text,p_reason text default '')
returns text language plpgsql security definer set search_path='' as $$
declare v_request public.shared_edit_requests%rowtype; v_target jsonb; v_after jsonb; v_status text;
begin
 select * into v_request from public.shared_edit_requests where id=p_request_id for update;
 if auth.uid() is null or v_request.id is null or v_request.requested_by=auth.uid() or not private.can_review_shared_edit(v_request.team_id,v_request.target_type)
 or not private.can_read_shared_target(v_request.target_type,v_request.target_id,v_request.team_id) then raise exception 'Reviewer is unavailable or cannot review their own request' using errcode='42501'; end if;
 if v_request.status<>'pending' or p_decision not in ('approved','rejected') or p_decision is null or length(coalesce(p_reason,''))>1000 then raise exception 'Request cannot be reviewed' using errcode='22023'; end if;
 if p_decision='rejected' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'Rejection reason is required' using errcode='22023'; end if;
 if p_decision='approved' then
  perform private.lock_workspace_members(v_request.team_id);
  if not private.can_review_shared_edit(v_request.team_id,v_request.target_type)
    or not private.can_read_shared_target(v_request.target_type,v_request.target_id,v_request.team_id) then
    raise exception 'Reviewer is unavailable or cannot review their own request' using errcode='42501';
  end if;
  begin v_target:=private.shared_edit_target(v_request.target_type,v_request.target_id,true);
  exception when insufficient_privilege then v_target:=null; end;
  if v_target is null or (v_target->>'team_id')::uuid<>v_request.team_id or (v_target->>'revision')::bigint<>v_request.base_revision then
   v_status:='needs_revision';
  else
   perform private.validate_shared_edit_changes(v_request.target_type,v_request.changes);
   perform private.apply_shared_edit(v_request.target_type,v_request.target_id,(v_target->'values') || v_request.changes);
   v_after:=private.shared_edit_target(v_request.target_type,v_request.target_id,false)->'values'; v_status:='approved';
  end if;
 else v_status:='rejected'; end if;
 update public.shared_edit_requests set status=v_status,reviewed_by=auth.uid(),review_reason=case when v_status='needs_revision' then 'Published content changed; revise and resubmit.' else trim(coalesce(p_reason,'')) end,
 reviewed_at=clock_timestamp(),after_snapshot=v_after where id=v_request.id;
 if v_request.legacy_song_request_id is not null and v_status in ('approved','rejected') then
  update public.song_edit_requests set status=v_status::public.song_edit_status,reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=v_request.legacy_song_request_id;
 end if;
 insert into public.notifications(team_id,profile_id,title,body,target_path,created_by)
 values(v_request.team_id,v_request.requested_by,'Shared edit request updated','Your request is ' || replace(v_status,'_',' ') || '.','/requests',auth.uid());
 return v_status;
end;
$$;
revoke all on function public.review_shared_edit_request(uuid,text,text) from public,anon;
grant execute on function public.review_shared_edit_request(uuid,text,text) to authenticated;

create function public.withdraw_shared_edit_request(p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.shared_edit_requests%rowtype;
begin
 select * into v_request from public.shared_edit_requests where id=p_request_id for update;
 if auth.uid() is null or v_request.requested_by is distinct from auth.uid() or not private.is_approved_member(v_request.team_id) then raise exception 'Only the active requester can withdraw' using errcode='42501'; end if;
 if v_request.status not in ('pending','needs_revision') then raise exception 'Request cannot be withdrawn' using errcode='22023'; end if;
 update public.shared_edit_requests set status='withdrawn' where id=p_request_id;
end;
$$;
revoke all on function public.withdraw_shared_edit_request(uuid) from public,anon;
grant execute on function public.withdraw_shared_edit_request(uuid) to authenticated;

-- Replace all permissive INSERT/UPDATE paths; SELECT and DELETE stay unchanged.
do $$ declare v_policy record; begin
 for v_policy in select policyname from pg_policies where schemaname='public' and tablename='songs' and cmd in ('INSERT','UPDATE','ALL') loop
  execute format('drop policy %I on public.songs',v_policy.policyname);
 end loop;
end $$;
create policy "Active members add songs with immutable identity" on public.songs for insert to authenticated
 with check(private.is_approved_member(team_id) and created_by=auth.uid() and status='approved' and deleted_at is null);
create policy "Creators and owners admins edit songs" on public.songs for update to authenticated
 using(private.is_approved_member(team_id) and (created_by=auth.uid() or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
 or private.has_team_role(team_id,array['worship_leader']::public.team_role[]))
 with check(private.is_approved_member(team_id) and (created_by=auth.uid() or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
 or private.has_team_role(team_id,array['worship_leader']::public.team_role[]));
-- The leader UPDATE path supports existing soft deletion only; this trigger
-- prevents it being used for any published-content edit or protected metadata.
create function private.guard_song_identity_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (not private.is_approved_member(new.team_id) or new.created_by<>auth.uid() or new.status<>'approved' or new.deleted_at is not null) then raise exception 'Song identity must match its active creator' using errcode='42501'; end if;
  return new;
 end if;
 if new.id<>old.id or new.team_id<>old.team_id or new.created_by<>old.created_by or new.status<>old.status
 or new.created_at<>old.created_at or new.seed_source is distinct from old.seed_source then raise exception 'Protected song identity cannot change' using errcode='42501'; end if;
 if auth.uid() is null then return new; end if;
 if not private.is_approved_member(old.team_id) then raise exception 'Active team membership required' using errcode='42501'; end if;
 if new.deleted_at is distinct from old.deleted_at then
  if not private.has_team_role(old.team_id,array['owner','admin','worship_leader']::public.team_role[])
   or (to_jsonb(new)-array['deleted_at','updated_at','sync_revision']) is distinct from (to_jsonb(old)-array['deleted_at','updated_at','sync_revision']) then raise exception 'Deletion authority cannot edit song content' using errcode='42501'; end if;
 elsif old.created_by<>auth.uid() and not private.has_team_role(old.team_id,array['owner','admin']::public.team_role[]) then
  raise exception 'Submit a song edit request for owner/admin approval' using errcode='42501';
 elsif old.deleted_at is not null then raise exception 'Restore the song before editing' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function private.guard_song_identity_content() from public,anon,authenticated;
create trigger songs_guard_identity before insert or update on public.songs for each row execute function private.guard_song_identity_content();

-- Existing personal reminder receipts do not increment shared revisions.
create function private.bump_shared_content_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.shared_edit_revision:=0; return new; end if;
 if tg_table_name='notifications' then
  if (to_jsonb(new)-array['read_at','acknowledged_at','shared_edit_revision']) is distinct from (to_jsonb(old)-array['read_at','acknowledged_at','shared_edit_revision']) then new.shared_edit_revision:=old.shared_edit_revision+1; else new.shared_edit_revision:=old.shared_edit_revision; end if;
 else new.shared_edit_revision:=old.shared_edit_revision+1; end if;
 return new;
end;
$$;
revoke all on function private.bump_shared_content_revision() from public,anon,authenticated;
create trigger announcements_shared_revision before insert or update on public.announcements for each row execute function private.bump_shared_content_revision();
create trigger notifications_shared_revision before insert or update on public.notifications for each row execute function private.bump_shared_content_revision();
create trigger dance_notes_shared_revision before insert or update on public.dance_notes for each row execute function private.bump_shared_content_revision();
create function private.guard_shared_notice_choreography() returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text;
begin
 v_type:=case tg_table_name when 'dance_notes' then 'choreography' else 'reminder' end;
 if tg_table_name='notifications' and (to_jsonb(new)-array['read_at','acknowledged_at','shared_edit_revision'])=(to_jsonb(old)-array['read_at','acknowledged_at','shared_edit_revision']) then
  if auth.uid() is not null and (old.profile_id<>auth.uid() or not private.is_approved_member(old.team_id)) then raise exception 'Only the recipient can update a personal receipt' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is not null and not private.can_review_shared_edit(old.team_id,v_type) then raise exception 'Shared changes require the responsible reviewer' using errcode='42501'; end if;
 if new.team_id<>old.team_id or new.id<>old.id or new.created_by is distinct from old.created_by then raise exception 'Shared identity cannot change' using errcode='42501'; end if;
 if tg_table_name='notifications' and (to_jsonb(new)-array['title','body','priority','shared_edit_revision']) is distinct from (to_jsonb(old)-array['title','body','priority','shared_edit_revision']) then raise exception 'Reminder recipients, schedule and personal receipts cannot change with shared content' using errcode='42501'; end if;
 if tg_table_name='dance_notes' and (to_jsonb(new)->'song_id' is distinct from to_jsonb(old)->'song_id' or to_jsonb(new)->'event_id' is distinct from to_jsonb(old)->'event_id') then raise exception 'Choreography links cannot change' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function private.guard_shared_notice_choreography() from public,anon,authenticated;
create trigger notifications_guard_content before update on public.notifications for each row execute function private.guard_shared_notice_choreography();
create trigger dance_notes_guard_content before update on public.dance_notes for each row execute function private.guard_shared_notice_choreography();

-- Mirror every actual content write in revisions and the existing sync stream.
create function private.bump_workspace_sync_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.sync_revision not in (0,1) then raise exception 'Invalid initial revision' using errcode='22023'; end if;
  new.sync_revision:=1;
 else
  if new.sync_revision not in (old.sync_revision,old.sync_revision+1) then raise exception 'Invalid revision' using errcode='22023'; end if;
  new.sync_revision:=old.sync_revision+1;
 end if;
 return new;
end;
$$;
create function private.record_workspace_sync_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_type text; v_row jsonb; v_revision bigint;
begin
 v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_op='DELETE' then v_row:=v_row || jsonb_build_object('deleted_at',clock_timestamp()); end if;
 v_revision:=(v_row->>'sync_revision')::bigint+case when tg_op='DELETE' then 1 else 0 end;
 if tg_table_name='setlist_songs' then select team_id into v_team from public.setlists where id=(v_row->>'setlist_id')::uuid; v_type:='setlist_song';
 else v_team:=(v_row->>'team_id')::uuid; v_type:=case tg_table_name when 'songs' then 'song' when 'events' then 'event' else 'setlist' end; end if;
 -- A parent cascade already emits the parent tombstone when its row is gone.
 if v_team is null then return old; end if;
 if tg_op='DELETE' or v_row->>'deleted_at' is not null then
  v_row:=jsonb_build_object('id',v_row->'id','team_id',v_team,'setlist_id',v_row->'setlist_id','deleted_at',v_row->'deleted_at',
    'approval_status',v_row->'approval_status','status',v_row->'status','created_by',v_row->'created_by');
 end if;
 insert into public.worship_sync_changes(team_id,entity_type,entity_id,operation,revision,payload)
 values(v_team,v_type,(v_row->>'id')::uuid,case when tg_op='DELETE' or v_row->>'deleted_at' is not null then 'delete' else 'upsert' end,v_revision,v_row || jsonb_build_object('sync_revision',v_revision));
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.bump_workspace_sync_revision(),private.record_workspace_sync_change() from public,anon,authenticated;
create trigger songs_revision before insert or update on public.songs for each row execute function private.bump_workspace_sync_revision();
create trigger setlists_revision before insert or update on public.setlists for each row execute function private.bump_workspace_sync_revision();
create trigger events_revision before insert or update on public.events for each row execute function private.bump_workspace_sync_revision();
create trigger setlist_songs_revision before insert or update on public.setlist_songs for each row execute function private.bump_workspace_sync_revision();
create trigger songs_sync_log after insert or update on public.songs for each row execute function private.record_workspace_sync_change();
create trigger setlists_sync_log after insert or update on public.setlists for each row execute function private.record_workspace_sync_change();
create trigger events_sync_log after insert or update on public.events for each row execute function private.record_workspace_sync_change();
create trigger setlist_songs_sync_log after insert or update on public.setlist_songs for each row execute function private.record_workspace_sync_change();
create trigger songs_delete_sync_log before delete on public.songs for each row execute function private.record_workspace_sync_change();
create trigger setlists_delete_sync_log before delete on public.setlists for each row execute function private.record_workspace_sync_change();
create trigger events_delete_sync_log before delete on public.events for each row execute function private.record_workspace_sync_change();
create trigger setlist_songs_delete_sync_log before delete on public.setlist_songs for each row execute function private.record_workspace_sync_change();

create function private.touch_event_assignment_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then update public.events set updated_at=clock_timestamp() where id=old.event_id; end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' or new.event_id<>old.event_id) then update public.events set updated_at=clock_timestamp() where id=new.event_id; end if;
 return null;
end;
$$;
revoke all on function private.touch_event_assignment_revision() from public,anon,authenticated;
create trigger event_assignments_revision after insert or update or delete on public.event_assignments for each row execute function private.touch_event_assignment_revision();

-- Keep legacy proposals readable, but remove broad leader decisions/raw writes.
drop policy if exists "Song reviewers can view edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can update edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can delete edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can view and review edits" on public.song_edit_requests;
revoke update,delete on public.song_edit_requests from authenticated;
revoke insert on public.song_edit_requests from authenticated;
create policy "Requester and owners admins read legacy song edits" on public.song_edit_requests for select to authenticated using (
 exists(select 1 from public.songs s where s.id=song_id and private.is_approved_member(s.team_id)
 and (submitted_by=auth.uid() or private.has_team_role(s.team_id,array['owner','admin']::public.team_role[])))
);
insert into public.shared_edit_requests(team_id,target_type,target_id,base_revision,changes,before_snapshot,reason,status,requested_by,request_nonce,legacy_song_request_id)
select s.team_id,'song',s.id,s.sync_revision,jsonb_strip_nulls(jsonb_build_object('title',r.proposed_title,'artist',r.proposed_artist,'original_key',r.proposed_key,'bpm',r.proposed_bpm,'lyrics_chords',r.proposed_lyrics_chords)),
 jsonb_build_object('title',s.title,'artist',s.artist,'original_key',s.original_key,'bpm',s.bpm,'lyrics_chords',s.lyrics_chords),
 'Legacy song proposal; original revision is unknown. Revise and resubmit.','needs_revision',r.submitted_by,gen_random_uuid(),r.id
from public.song_edit_requests r join public.songs s on s.id=r.song_id where r.status='pending';

-- Reuse the existing sync command contract with explicit authorization. Row triggers own
-- change records, so the RPC must not write duplicate/API-private log rows.
create or replace function public.apply_worship_mutation(
  p_device_id text, p_mutation_id uuid, p_command text, p_payload jsonb, p_base_revision bigint default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team_id uuid; v_existing jsonb; v_current_revision bigint; v_event_revision bigint; v_result jsonb; v_song_id uuid;
begin
  if coalesce(jsonb_typeof(p_payload),'')<>'object' or octet_length(p_payload::text)>2200000
    or p_mutation_id is null or p_device_id is null or length(p_device_id) not between 1 and 200
    or p_base_revision is null or p_base_revision<0
    or p_command is null or p_command not in ('song.create','song.update','song.delete','song.restore',
      'setlist.create','setlist.update','setlist.delete','setlist.presentation.update') then
    raise exception 'Invalid worship mutation' using errcode='22023';
  end if;
  v_team_id := nullif(p_payload->>'teamId','')::uuid;
  if auth.uid() is null or v_team_id is null or not private.is_approved_member(v_team_id) then
    raise exception 'Active team membership required' using errcode = '28000';
  end if;
  perform private.lock_workspace_members(v_team_id);
  if p_command like 'setlist.%' and not private.has_workspace_permission(v_team_id,'setlists.manage') then
    raise exception 'Setlist changes require a setlist manager' using errcode='42501';
  end if;
  if p_command in ('setlist.create','setlist.update') and not private.has_workspace_permission(v_team_id,'events.manage') then
    raise exception 'Linked event changes require an event manager' using errcode='42501';
  end if;
  if p_command in ('song.delete','song.restore') and not private.has_team_role(v_team_id,array['owner','admin','worship_leader']::public.team_role[]) then
    raise exception 'Song deletion or restore requires a song manager' using errcode='42501';
  end if;
  v_song_id := nullif(p_payload->>'id','')::uuid;
  if v_song_id is null then raise exception 'Mutation target required' using errcode='22023'; end if;
  -- Global IDs also need protection against simultaneous creates by two teams.
  perform pg_advisory_xact_lock(hashtextextended((case when p_command like 'song.%' then 'song:' else 'setlist:' end) || v_song_id::text,0));
  if p_command in ('setlist.create','setlist.update') then
    perform pg_advisory_xact_lock(hashtextextended('event:' || (p_payload->>'eventId')::uuid::text,0));
  end if;
  if (p_command like 'song.%' and exists(select 1 from public.songs where id=v_song_id and team_id<>v_team_id))
    or (p_command like 'setlist.%' and exists(select 1 from public.setlists where id=v_song_id and team_id<>v_team_id))
    or (p_command in ('setlist.create','setlist.update') and exists(select 1 from public.events where id=(p_payload->>'eventId')::uuid and team_id<>v_team_id)) then
    raise exception 'Mutation target is unavailable' using errcode='42501';
  end if;
  if p_command like 'song.%' and exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
    and status<>'approved' and created_by<>auth.uid()
    and not private.has_team_role(v_team_id,array['owner','admin']::public.team_role[])) then
    raise exception 'Mutation target is unavailable' using errcode='42501';
  end if;
  if p_command='song.update' and not exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
    and (created_by=auth.uid() or private.has_team_role(v_team_id,array['owner','admin']::public.team_role[]))) then
    raise exception 'Song changes require the creator or an owner/admin' using errcode='42501';
  end if;
  -- Receipts are keyed globally by device/mutation; lock that same identity so
  -- simultaneous retries read the committed original result before doing work.
  perform pg_advisory_xact_lock(hashtextextended('sync-receipt:' || p_device_id || ':' || p_mutation_id::text,0));
  if exists(select 1 from public.worship_sync_receipts where device_id=p_device_id and mutation_id=p_mutation_id and team_id<>v_team_id) then
    raise exception 'Mutation receipt is unavailable' using errcode='42501';
  end if;
  select result into v_existing from public.worship_sync_receipts where device_id = p_device_id and mutation_id = p_mutation_id and team_id=v_team_id;
  if v_existing is not null then return v_existing; end if;

  if p_command in ('song.create', 'song.update') then
    v_song_id := (p_payload->>'id')::uuid;
    -- Serialize creation too: an absent row cannot provide a row lock.
    perform pg_advisory_xact_lock(hashtextextended('song:' || v_song_id::text,0));
    if p_command='song.update' and not exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
      and (created_by=auth.uid() or private.has_team_role(v_team_id,array['owner','admin']::public.team_role[]))) then
      raise exception 'Song changes require the creator or an owner/admin' using errcode='42501';
    end if;
    select sync_revision into v_current_revision from public.songs where id = v_song_id and team_id = v_team_id for update;
    if (p_command = 'song.create' and v_current_revision is not null)
      or (p_command = 'song.update' and coalesce(v_current_revision, 0) <> p_base_revision) then
      return jsonb_build_object('status', 'conflict', 'cloud_payload', (select to_jsonb(s) from public.songs s where s.id = v_song_id and s.team_id=v_team_id));
    end if;
    insert into public.songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, youtube_url, spotify_url, image_url, album, tags, created_by, sync_revision, updated_at, deleted_at)
    values (v_song_id, v_team_id, p_payload->>'title', p_payload->>'artist', p_payload->>'originalKey', nullif(p_payload->>'bpm','')::integer, coalesce(p_payload->>'timeSignature','4/4'), coalesce(p_payload->>'lyricsChords',''), nullif(p_payload->>'youtubeUrl',''), nullif(p_payload->>'spotifyUrl',''), nullif(p_payload->>'imageUrl',''), nullif(p_payload->>'album',''), array[]::text[], auth.uid(), 1, now(), null)
    on conflict (id) do update set title = excluded.title, artist = excluded.artist, original_key = excluded.original_key, bpm = excluded.bpm, time_signature = excluded.time_signature, lyrics_chords = excluded.lyrics_chords, youtube_url = excluded.youtube_url, spotify_url = excluded.spotify_url, image_url = excluded.image_url, album = excluded.album, deleted_at = null, sync_revision = public.songs.sync_revision + 1, updated_at = now() where public.songs.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
  elsif p_command in ('song.delete', 'song.restore') then
    v_song_id := (p_payload->>'id')::uuid;
    update public.songs set deleted_at = case when p_command = 'song.delete' then now() else null end, sync_revision = sync_revision + 1, updated_at = now() where id = v_song_id and team_id = v_team_id and sync_revision = p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(s) from public.songs s where s.id = v_song_id and s.team_id=v_team_id)); end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
  elsif p_command in ('setlist.create', 'setlist.update') then
    v_song_id := (p_payload->>'id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended('setlist:' || v_song_id::text,0));
    select sync_revision into v_current_revision from public.setlists where id = v_song_id and team_id = v_team_id for update;
    if exists(select 1 from public.setlists where id=v_song_id and team_id=v_team_id and deleted_at is not null) then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id));
    end if;
    if (p_command = 'setlist.create' and v_current_revision is not null)
      or (p_command = 'setlist.update' and (v_current_revision is null or v_current_revision <> p_base_revision)) then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    -- Absent event rows cannot provide row locks. Serialize their creation too.
    perform pg_advisory_xact_lock(hashtextextended('event:' || (p_payload->>'eventId')::uuid::text,0));
    -- The legacy client supplies only the setlist revision. It must not rewrite
    -- an existing event until it also supplies that event's saved revision.
    select sync_revision into v_event_revision from public.events
      where id=(p_payload->>'eventId')::uuid and team_id=v_team_id for update;
    if exists(select 1 from public.events where id=(p_payload->>'eventId')::uuid and team_id=v_team_id
      and (deleted_at is not null or approval_status<>'approved')) then
      raise exception 'Linked event unavailable' using errcode='42501';
    end if;
    if found and nullif(p_payload->>'eventRevision','')::bigint is distinct from v_event_revision then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id));
    end if;
    insert into public.events (id, team_id, type, name, event_date, location, starts_at, call_time, rehearsal_time, created_by, deleted_at, sync_revision)
    values ((p_payload->>'eventId')::uuid, v_team_id, coalesce(p_payload->>'eventType','service')::public.event_type, p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, auth.uid(), null, 1)
    on conflict (id) do update set type=excluded.type, name=excluded.name, event_date=excluded.event_date, location=excluded.location, starts_at=excluded.starts_at, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, deleted_at=null, sync_revision=public.events.sync_revision + 1, updated_at=now() where public.events.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    insert into public.setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, created_by, deleted_at, sync_revision, updated_at)
    values (v_song_id, v_team_id, (p_payload->>'eventId')::uuid, p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'serviceTimes','[]'::jsonb))), array[]::text[]), nullif(p_payload->>'notes',''), auth.uid(), null, 1, now())
    on conflict (id) do update set event_id=excluded.event_id, name=excluded.name, setlist_date=excluded.setlist_date, location=excluded.location, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, service_times=excluded.service_times, notes=excluded.notes, deleted_at=null, sync_revision=public.setlists.sync_revision + 1, updated_at=now() where public.setlists.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id = v_song_id;
  elsif p_command = 'setlist.presentation.update' then
    v_song_id := (p_payload->>'id')::uuid;
    if coalesce(jsonb_typeof(p_payload->'presentationSettings'),'') <> 'object' or octet_length((p_payload->'presentationSettings')::text)>2097152 then
      raise exception 'Invalid presentation settings' using errcode = '22023';
    end if;
    select sync_revision into v_current_revision from public.setlists where id = v_song_id and team_id = v_team_id and deleted_at is null;
    if v_current_revision is null then
      raise exception 'Setlist not found' using errcode = 'P0002';
    end if;
    if v_current_revision <> p_base_revision then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    update public.setlists
      set presentation_settings = p_payload->'presentationSettings',
          sync_revision = sync_revision + 1,
          updated_at = now()
      where id = v_song_id and team_id = v_team_id and sync_revision = p_base_revision and deleted_at is null;
    if not found then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id = v_song_id;
  elsif p_command = 'setlist.delete' then
    v_song_id := (p_payload->>'id')::uuid;
    update public.setlists set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where id=v_song_id and team_id=v_team_id and sync_revision=p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id)); end if;
    update public.setlist_songs set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where setlist_id=v_song_id;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id=v_song_id;
  else
    raise exception 'Unsupported worship mutation: %', p_command using errcode = '22023';
  end if;
  insert into public.worship_sync_receipts (device_id, mutation_id, team_id, result) values (p_device_id, p_mutation_id, v_team_id, v_result);
  return v_result;
end; $$;

revoke all on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) to authenticated;

-- Raw song deletion would acquire song locks before its aggregate parents.
-- Creator/admin INSERT and UPDATE policies and their identity guard remain intact.
revoke delete,truncate on public.songs from public,anon,authenticated;
-- Only checked mutations may create receipts; retain the existing scoped reads.
revoke insert,update,delete,truncate,references,trigger on public.worship_sync_receipts from public,anon,authenticated;
