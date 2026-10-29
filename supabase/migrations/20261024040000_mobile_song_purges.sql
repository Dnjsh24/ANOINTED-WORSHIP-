-- Trash-only permanent deletion. Existing cascade/child guards remain authoritative.
begin;
create index mobile_song_purge_readiness_slot_idx on public.song_readiness(slot_id);
create table private.mobile_song_purge_receipts(actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce));
alter table private.mobile_song_purge_receipts enable row level security;
revoke all on private.mobile_song_purge_receipts from public,anon,authenticated;
create trigger mobile_song_purge_receipt_immutable before update or delete on private.mobile_song_purge_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.require_mobile_song_purge_actor(p_team uuid,p_member uuid,p_created timestamptz default null) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_created timestamptz;
begin
 v_created:=private.require_mobile_song_restore_actor(p_team,p_member,p_created);
 if not private.has_team_role(p_team,array['owner','admin']::public.team_role[]) or not private.mobile_has_permission(p_team,'songs.delete') then raise exception 'Current owner/admin song deletion authority required' using errcode='42501';end if;
 return v_created;
end;
$$;
-- Fingerprint only: private bodies never leave SQL. Include complete affected
-- row values so edits, reincarnations and parent aggregate revisions conflict.
-- ponytail: 2000 affected rows is the review ceiling; larger purges need a separate workflow.
create function private.mobile_song_purge_impact(p_song uuid,p_team uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_counts jsonb;v_fingerprint text;
begin
 if exists(select 1 from public.setlist_songs c join public.setlists p on p.id=c.setlist_id where c.song_id=p_song and p.team_id<>p_team)
 or exists(select 1 from public.dance_notes where song_id=p_song and team_id<>p_team)
 or exists(select 1 from public.practice_files where song_id=p_song and team_id<>p_team)
 or exists(select 1 from public.mobile_annotations where (song_id=p_song or slot_id in(select id from public.setlist_songs where song_id=p_song)) and team_id<>p_team)
 or exists(select 1 from public.song_favorites c join public.team_members m on m.id=c.team_member_id where c.song_id=p_song and m.team_id<>p_team)
 or exists(select 1 from public.song_readiness c join public.events e on e.id=c.event_id join public.team_members m on m.id=c.team_member_id where c.slot_id in(select id from public.setlist_songs where song_id=p_song) and(e.team_id<>p_team or m.team_id<>p_team))
 or exists(select 1 from public.shared_edit_requests where legacy_song_request_id in(select id from public.song_edit_requests where song_id=p_song) and team_id<>p_team)
 then return jsonb_build_object('status','related-records-blocked','impact',null);end if;
 with rows as (
 select 'setlists' kind,p.id::text id,to_jsonb(p) body from public.setlists p where p.id in(select setlist_id from public.setlist_songs where song_id=p_song)
 union all select 'setlistSlots',c.id::text,to_jsonb(c) from public.setlist_songs c where song_id=p_song
 union all select 'favorites',c.team_member_id::text,to_jsonb(c) from public.song_favorites c where song_id=p_song
 union all select 'versions',c.id::text,to_jsonb(c) from public.song_versions c where song_id=p_song
 union all select 'editRequests',c.id::text,to_jsonb(c) from public.song_edit_requests c where song_id=p_song
 union all select 'danceNotes',c.id::text,to_jsonb(c) from public.dance_notes c where song_id=p_song
 union all select 'annotations',c.id::text,to_jsonb(c) from public.mobile_annotations c where song_id=p_song or slot_id in(select id from public.setlist_songs where song_id=p_song)
 union all select 'annotations','web:'||c.id::text,to_jsonb(c) from public.user_annotations c where setlist_song_id in(select id from public.setlist_songs where song_id=p_song)
 union all select 'readinessResponses',c.event_id::text||':'||c.slot_id::text||':'||c.team_member_id::text,to_jsonb(c) from public.song_readiness c where slot_id in(select id from public.setlist_songs where song_id=p_song)
 union all select 'detachedPracticeFiles',c.id::text,to_jsonb(c) from public.practice_files c where song_id=p_song
 union all select 'detachedLegacyRequests',c.id::text,to_jsonb(c) from public.shared_edit_requests c where legacy_song_request_id in(select id from public.song_edit_requests where song_id=p_song)
 ), bounded as(select kind,id,encode(sha256(convert_to(body::text,'UTF8')),'hex') fingerprint from rows limit 2001)
 select coalesce(jsonb_agg(jsonb_build_array(kind,id,fingerprint) order by kind,id),'[]'::jsonb) into v_rows from bounded;
 if jsonb_array_length(v_rows)>2000 then return jsonb_build_object('status','impact-too-large','impact',null);end if;
 select jsonb_object_agg(k,(select count(*) from jsonb_array_elements(v_rows) r where r->>0=k))||jsonb_build_object('songs',1) into v_counts from unnest(array['setlists','setlistSlots','favorites','versions','editRequests','danceNotes','annotations','readinessResponses','detachedPracticeFiles','detachedLegacyRequests']) k;
 v_fingerprint:=encode(sha256(convert_to(v_rows::text,'UTF8')),'hex');
 return jsonb_build_object('status','ready','impact',jsonb_build_object('counts',v_counts,'fingerprint',v_fingerprint));
end;
$$;
revoke all on function private.require_mobile_song_purge_actor(uuid,uuid,timestamptz),private.mobile_song_purge_impact(uuid,uuid) from public,anon,authenticated;
create function public.mobile_read_song_purge_state(p_team_id uuid,p_member_id uuid,p_song_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_created timestamptz;v_song public.songs%rowtype;v_current jsonb;v_review jsonb:=jsonb_build_object('status','missing','impact',null);
begin
 v_created:=private.require_mobile_song_purge_actor(p_team_id,p_member_id);
 select * into v_song from public.songs where id=p_song_id and team_id=p_team_id and status='approved';
 if found then
  v_current:=private.mobile_song_trash_entry(v_song);
  if v_song.deleted_at is null then v_review:=jsonb_build_object('status','not-trashed','impact',null);
  else v_review:=private.mobile_song_purge_impact(p_song_id,p_team_id);end if;
 end if;
 return jsonb_build_object('version',2,'memberCreatedAt',v_created,'songId',p_song_id,'current',v_current,'fetchedAt',clock_timestamp())||v_review;
end;
$$;
create function public.mobile_purge_song(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_member uuid;v_nonce uuid;v_song_id uuid;v_keys text[];v_key text;v_base jsonb;v_impact jsonb;v_song public.songs%rowtype;v_saved private.mobile_song_purge_receipts%rowtype;v_parents uuid[];v_after_parents uuid[];v_review jsonb;v_status text;v_current jsonb;v_result jsonb;v_time timestamptz;
begin
 if v_user is null then raise exception 'Authenticated song authority required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','memberCreatedAt','requestNonce','base','impact'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>8192 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid song purge intent' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','memberCreatedAt','requestNonce'] loop if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid song purge actor' using errcode='22023';end if;end loop;
 if (p_request->>'userId')::uuid<>v_user then raise exception 'Own song purge account required' using errcode='42501';end if;
 v_team:=(p_request->>'teamId')::uuid;v_member:=(p_request->>'memberId')::uuid;v_nonce:=(p_request->>'requestNonce')::uuid;v_base:=p_request->'base';v_keys:=array['id','teamId','createdAt','revision','deletedAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Exact deleted song base required' using errcode='22023';end if;
 foreach v_key in array array['id','teamId','createdAt','deletedAt'] loop if jsonb_typeof(v_base->v_key) is distinct from 'string' then raise exception 'Invalid song purge base' using errcode='22023';end if;end loop;
 v_song_id:=(v_base->>'id')::uuid;if (v_base->>'teamId')::uuid<>v_team then raise exception 'Selected song team differs' using errcode='42501';end if;
 if jsonb_typeof(v_base->'revision') is distinct from 'number' or(v_base->>'revision')::numeric<>trunc((v_base->>'revision')::numeric) or(v_base->>'revision')::numeric not between 1 and 9007199254740990 then raise exception 'Invalid exact song revision' using errcode='22023';end if;
 foreach v_key in array array['createdAt','deletedAt'] loop if v_base->>v_key !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact song timestamp required' using errcode='22023';end if;perform(v_base->>v_key)::timestamptz;end loop;
 if p_request->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact member timestamp required' using errcode='22023';end if;
 v_impact:=p_request->'impact';v_keys:=array['counts','fingerprint'];
 if jsonb_typeof(v_impact) is distinct from 'object' or not v_impact ?& v_keys or v_impact-v_keys<>'{}'::jsonb or jsonb_typeof(v_impact->'fingerprint') is distinct from 'string' or v_impact->>'fingerprint' !~ '^[a-f0-9]{64}$' then raise exception 'Complete impact required' using errcode='22023';end if;
 v_keys:=array['songs','setlists','setlistSlots','favorites','versions','editRequests','danceNotes','annotations','readinessResponses','detachedPracticeFiles','detachedLegacyRequests'];
 if jsonb_typeof(v_impact->'counts') is distinct from 'object' or not (v_impact->'counts') ?& v_keys or (v_impact->'counts')-v_keys<>'{}'::jsonb or v_impact#>'{counts,songs}' is distinct from '1'::jsonb then raise exception 'Complete impact counts required' using errcode='22023';end if;
 foreach v_key in array v_keys loop if jsonb_typeof(v_impact->'counts'->v_key) is distinct from 'number' or (v_impact->'counts'->>v_key)::numeric<>trunc((v_impact->'counts'->>v_key)::numeric) or (v_impact->'counts'->>v_key)::numeric not between 0 and 2000 then raise exception 'Invalid impact count' using errcode='22023';end if;end loop;
 -- Current authority and actor incarnation always precede immutable history.
 perform private.require_mobile_song_purge_actor(v_team,v_member,(p_request->>'memberCreatedAt')::timestamptz);
 perform pg_advisory_xact_lock(hashtextextended('song-purge-actor:'||v_user::text,0));
 select * into v_saved from private.mobile_song_purge_receipts where actor_id=v_user and request_nonce=v_nonce;
 if found then if v_saved.request is distinct from p_request then raise exception 'Purge nonce belongs to another reviewed intent' using errcode='22023';end if;return v_saved.result;end if;
 select coalesce(array_agg(distinct c.setlist_id order by c.setlist_id),'{}'::uuid[]) into v_parents from public.setlist_songs c join public.setlists p on p.id=c.setlist_id and p.team_id=v_team where c.song_id=v_song_id and exists(select 1 from public.songs s where s.id=v_song_id and s.team_id=v_team and s.status='approved');
 perform 1 from public.setlists where id=any(v_parents) order by id for update;
 perform 1 from public.songs where id=v_song_id and team_id=v_team and status='approved' for update;
 -- A parent discovered after waiting must never be locked after the song.
 select coalesce(array_agg(distinct setlist_id order by setlist_id),'{}'::uuid[]) into v_after_parents from public.setlist_songs where song_id=v_song_id;
 select * into v_song from public.songs where id=v_song_id and team_id=v_team and status='approved';
 if not found then v_status:='missing';
 else
  v_current:=private.mobile_song_restore_snapshot(v_song);
  if v_song.created_at is distinct from(v_base->>'createdAt')::timestamptz or v_song.sync_revision<>(v_base->>'revision')::bigint or v_song.deleted_at is null or v_song.deleted_at is distinct from(v_base->>'deletedAt')::timestamptz or v_parents is distinct from v_after_parents then v_status:='conflict';
  else
   -- Bound work and reject foreign legacy links before locking child rows.
   v_review:=private.mobile_song_purge_impact(v_song_id,v_team);
   if v_review->>'status'='related-records-blocked' then v_status:='related-records-blocked';
   elsif v_review->>'status'<>'ready' or v_review->'impact' is distinct from v_impact then v_status:='conflict';
   else
   perform 1 from public.setlist_songs where song_id=v_song_id order by id for update;
   perform 1 from public.song_favorites where song_id=v_song_id order by team_member_id for update;
   perform 1 from public.song_versions where song_id=v_song_id order by id for update;
   perform 1 from public.song_edit_requests where song_id=v_song_id order by id for update;
   perform 1 from public.dance_notes where song_id=v_song_id order by id for update;
   perform 1 from public.mobile_annotations where song_id=v_song_id or slot_id in(select id from public.setlist_songs where song_id=v_song_id) order by id for update;
   perform 1 from public.user_annotations where setlist_song_id in(select id from public.setlist_songs where song_id=v_song_id) order by id for update;
   perform 1 from public.song_readiness where slot_id in(select id from public.setlist_songs where song_id=v_song_id) order by event_id,slot_id,team_member_id for update;
   perform 1 from public.practice_files where song_id=v_song_id order by id for update;
   perform 1 from public.shared_edit_requests where legacy_song_request_id in(select id from public.song_edit_requests where song_id=v_song_id) order by id for update;
   v_review:=private.mobile_song_purge_impact(v_song_id,v_team);
   if v_review->>'status'='related-records-blocked' then v_status:='related-records-blocked';
   elsif v_review->>'status'<>'ready' or v_review->'impact' is distinct from v_impact then v_status:='conflict';
   else
    begin
     perform public.delete_song_cascade(v_song_id);
     v_status:='applied';v_current:=null;
    exception when insufficient_privilege or check_violation or foreign_key_violation then
     -- Subtransaction restores every deleted child, parent revision and sync effect.
     v_status:='related-records-blocked';
    end;
   end if;
   end if;
  end if;
 end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_time);
 insert into private.mobile_song_purge_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_user,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_read_song_purge_state(uuid,uuid,uuid),public.mobile_purge_song(jsonb) from public,anon;
grant execute on function public.mobile_read_song_purge_state(uuid,uuid,uuid),public.mobile_purge_song(jsonb) to authenticated;
commit;
