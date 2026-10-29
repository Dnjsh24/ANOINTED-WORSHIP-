-- Durable restoration only; preserve existing song identity/revision/sync guards.
begin;
create table private.mobile_song_restore_receipts(actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce));
alter table private.mobile_song_restore_receipts enable row level security;
revoke all on private.mobile_song_restore_receipts from public,anon,authenticated;
create trigger mobile_song_restore_receipt_immutable before update or delete on private.mobile_song_restore_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.require_mobile_song_restore_actor(p_team uuid,p_member uuid,p_created timestamptz default null) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_actor public.team_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Authenticated song authority required' using errcode='42501';end if;
 perform 1 from public.team_members where team_id=p_team order by id for update;
 select * into v_actor from public.team_members where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active';
 if not found or v_actor.role not in('owner','admin','worship_leader') or p_created is not null and v_actor.created_at is distinct from p_created then raise exception 'Original current song deletion authority required' using errcode='42501';end if;
 -- Website restore uses songs.delete. Existing song identity guard further
 -- restricts deletion changes to these roles, and explicit edit denial blocks it.
 if private.permission_override_value(p_team,'songs.edit') is false then raise exception 'Song editing is explicitly denied' using errcode='42501';end if;
 return v_actor.created_at;
end;
$$;
create function private.mobile_song_restore_snapshot(p_song public.songs) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$select jsonb_build_object('id',p_song.id,'teamId',p_song.team_id,'createdAt',p_song.created_at,'revision',p_song.sync_revision,'deletedAt',p_song.deleted_at)$$;
create function private.mobile_song_trash_entry(p_song public.songs) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$select jsonb_build_object('snapshot',private.mobile_song_restore_snapshot(p_song),'title',p_song.title,'artist',p_song.artist,'originalKey',p_song.original_key)$$;
revoke all on function private.require_mobile_song_restore_actor(uuid,uuid,timestamptz),private.mobile_song_restore_snapshot(public.songs),private.mobile_song_trash_entry(public.songs) from public,anon,authenticated;
create function public.mobile_read_song_trash(p_team_id uuid,p_member_id uuid,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_created timestamptz;v_rows jsonb;v_items jsonb;v_next text;
begin
 v_created:=private.require_mobile_song_restore_actor(p_team_id,p_member_id);
 select coalesce(jsonb_agg(private.mobile_song_trash_entry(s::public.songs) order by s.id),'[]'::jsonb) into v_rows from(select * from public.songs where team_id=p_team_id and status='approved' and deleted_at is not null and(p_after is null or id>p_after) order by id limit 51)s;
 v_items:=case when jsonb_array_length(v_rows)>50 then v_rows-50 else v_rows end;
 if jsonb_array_length(v_rows)>50 then v_next:=v_items#>>'{49,snapshot,id}';end if;
 return jsonb_build_object('version',2,'memberCreatedAt',v_created,'items',v_items,'after',p_after,'nextCursor',v_next,'fetchedAt',clock_timestamp());
end;
$$;
create function public.mobile_read_song_restore_state(p_team_id uuid,p_member_id uuid,p_song_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_created timestamptz;v_song public.songs%rowtype;v_current jsonb;
begin
 v_created:=private.require_mobile_song_restore_actor(p_team_id,p_member_id);
 select * into v_song from public.songs where id=p_song_id and team_id=p_team_id and status='approved';
 if found then v_current:=private.mobile_song_trash_entry(v_song);end if;
 return jsonb_build_object('version',2,'memberCreatedAt',v_created,'songId',p_song_id,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
create function public.mobile_restore_song(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_member uuid;v_nonce uuid;v_song_id uuid;v_keys text[];v_key text;v_base jsonb;v_song public.songs%rowtype;v_saved private.mobile_song_restore_receipts%rowtype;v_status text;v_current jsonb;v_result jsonb;v_time timestamptz;
begin
 if v_user is null then raise exception 'Authenticated song authority required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','memberCreatedAt','requestNonce','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>8192 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid song restore intent' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','memberCreatedAt','requestNonce'] loop if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid song restore actor' using errcode='22023';end if;end loop;
 if (p_request->>'userId')::uuid<>v_user then raise exception 'Own song restore account required' using errcode='42501';end if;
 v_team:=(p_request->>'teamId')::uuid;v_member:=(p_request->>'memberId')::uuid;v_nonce:=(p_request->>'requestNonce')::uuid;v_base:=p_request->'base';v_keys:=array['id','teamId','createdAt','revision','deletedAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Exact deleted song base required' using errcode='22023';end if;
 foreach v_key in array array['id','teamId','createdAt','deletedAt'] loop if jsonb_typeof(v_base->v_key) is distinct from 'string' then raise exception 'Invalid song base' using errcode='22023';end if;end loop;
 v_song_id:=(v_base->>'id')::uuid;if (v_base->>'teamId')::uuid<>v_team then raise exception 'Selected song team differs' using errcode='42501';end if;
 if jsonb_typeof(v_base->'revision') is distinct from 'number' or(v_base->>'revision')::numeric<>trunc((v_base->>'revision')::numeric) or(v_base->>'revision')::numeric not between 1 and 9007199254740990 then raise exception 'Invalid exact song revision' using errcode='22023';end if;
 foreach v_key in array array['createdAt','deletedAt'] loop if v_base->>v_key !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact song timestamp required' using errcode='22023';end if;perform(v_base->>v_key)::timestamptz;end loop;
 if p_request->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact member timestamp required' using errcode='22023';end if;
 perform private.require_mobile_song_restore_actor(v_team,v_member,(p_request->>'memberCreatedAt')::timestamptz);
 perform pg_advisory_xact_lock(hashtextextended('song-restore-actor:'||v_user::text,0));
 select * into v_saved from private.mobile_song_restore_receipts where actor_id=v_user and request_nonce=v_nonce;
 if found then if v_saved.request is distinct from p_request then raise exception 'Restore nonce belongs to another deleted song intent' using errcode='22023';end if;return v_saved.result;end if;
 select * into v_song from public.songs where id=v_song_id and team_id=v_team and status='approved' for update;
 if not found then v_status:='missing';
 elsif v_song.created_at is distinct from(v_base->>'createdAt')::timestamptz or v_song.sync_revision<>(v_base->>'revision')::bigint or v_song.deleted_at is distinct from(v_base->>'deletedAt')::timestamptz then v_status:='conflict';v_current:=private.mobile_song_restore_snapshot(v_song);
 else
  -- Existing revision/sync/deletion triggers supply the single revision bump,
  -- upsert change log and tombstone retirement in this same transaction.
  update public.songs set deleted_at=null where id=v_song_id and team_id=v_team returning * into v_song;
  v_status:='applied';v_current:=private.mobile_song_restore_snapshot(v_song);
 end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_time);
 insert into private.mobile_song_restore_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_user,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_read_song_trash(uuid,uuid,uuid),public.mobile_read_song_restore_state(uuid,uuid,uuid),public.mobile_restore_song(jsonb) from public,anon;
grant execute on function public.mobile_read_song_trash(uuid,uuid,uuid),public.mobile_read_song_restore_state(uuid,uuid,uuid),public.mobile_restore_song(jsonb) to authenticated;
commit;

