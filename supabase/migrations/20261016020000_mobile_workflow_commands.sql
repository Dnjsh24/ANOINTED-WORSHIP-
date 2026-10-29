-- DRAFT: additive v2 attendance/review commands. Apply only after the preceding
-- website/mobile migrations and a reviewed release. No hosted application here.
-- Existing website attendance upserts keep their shape; triggers own revisions.
-- Forward recovery: disable this new RPC, retain receipts/revisions/tombstones,
-- fix forward. Dropping state would lose offline conflict/deletion evidence.
begin;

alter table public.attendance add column sync_revision bigint not null default 1
  check (sync_revision between 1 and 9007199254740991);

create table public.mobile_workflow_attendance_state (
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null, member_id uuid not null, actor_id uuid not null,
  attendance_id uuid not null, revision bigint not null check (revision between 1 and 9007199254740991),
  deleted boolean not null, changed_at timestamptz not null default clock_timestamp(),
  primary key(team_id,event_id,member_id)
);
create index mobile_workflow_attendance_actor_idx on public.mobile_workflow_attendance_state(actor_id,team_id);
-- Parent/member IDs deliberately have no cascading FK: tombstones must outlive
-- parent deletion and cache the original actor boundary before cascades run.
-- This one-time backfill scans existing attendance; inspect volume before release.
insert into public.mobile_workflow_attendance_state(team_id,event_id,member_id,actor_id,attendance_id,revision,deleted)
  select e.team_id,a.event_id,a.team_member_id,tm.profile_id,a.id,a.sync_revision,false
  from public.attendance a join public.events e on e.id=a.event_id
  join public.team_members tm on tm.id=a.team_member_id and tm.team_id=e.team_id;

create table public.mobile_workflow_attendance_changes (
  cursor bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null, member_id uuid not null, actor_id uuid not null, attendance_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  operation text not null check(operation in ('upsert','delete')), created_at timestamptz not null default clock_timestamp()
);
create index mobile_workflow_attendance_changes_actor_cursor on public.mobile_workflow_attendance_changes(actor_id,team_id,cursor);
create table public.mobile_workflow_command_receipts (
  actor_id uuid not null, team_id uuid not null references public.teams(id) on delete cascade,
  member_id uuid not null, command_id uuid not null, event_id uuid not null,
  command jsonb not null, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,team_id,command_id)
);
create index mobile_workflow_receipts_team_event on public.mobile_workflow_command_receipts(team_id,event_id);
alter table public.mobile_workflow_attendance_state enable row level security;
alter table public.mobile_workflow_attendance_changes enable row level security;
alter table public.mobile_workflow_command_receipts enable row level security;
revoke all on public.mobile_workflow_attendance_state,public.mobile_workflow_attendance_changes,public.mobile_workflow_command_receipts from public,anon,authenticated;
revoke all on sequence public.mobile_workflow_attendance_changes_cursor_seq from public,anon,authenticated;
grant select on public.mobile_workflow_attendance_state,public.mobile_workflow_attendance_changes to authenticated;
create policy mobile_workflow_attendance_state_own on public.mobile_workflow_attendance_state for select to authenticated
  using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
create policy mobile_workflow_attendance_changes_own on public.mobile_workflow_attendance_changes for select to authenticated
  using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
-- Receipts have NO direct client SELECT/write grant or policy. The guarded RPC
-- rechecks current actor/membership/action/event access before reading a receipt.

create function private.mobile_workflow_attendance_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare v_previous bigint; v_existing bigint;
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.event_id<>old.event_id or new.team_member_id<>old.team_member_id) then
    raise exception 'Attendance identity is immutable' using errcode='22023';
  end if;
  -- INSERT is also invoked before ON CONFLICT UPDATE. Never change durable state
  -- in this BEFORE trigger: an upsert must not record a phantom insertion.
  if tg_op='INSERT' then
    select a.sync_revision into v_existing from public.attendance a
      where a.event_id=new.event_id and a.team_member_id=new.team_member_id for update;
  else v_existing:=old.sync_revision; end if;
  select s.revision into v_previous from public.mobile_workflow_attendance_state s
    where s.event_id=new.event_id and s.member_id=new.team_member_id;
  new.sync_revision:=greatest(coalesce(v_previous,0),coalesce(v_existing,0))+1;
  return new;
end;
$$;
create function private.mobile_workflow_attendance_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_actor uuid; v_revision bigint; v_row public.attendance%rowtype;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  select s.team_id,s.actor_id into v_team,v_actor from public.mobile_workflow_attendance_state s
    where s.event_id=v_row.event_id and s.member_id=v_row.team_member_id;
  if v_team is null then
    select e.team_id,tm.profile_id into v_team,v_actor from public.events e
      join public.team_members tm on tm.id=v_row.team_member_id and tm.team_id=e.team_id where e.id=v_row.event_id;
  end if;
  -- Deleting a whole team already removes this team's cache state. Ordinary
  -- event/member cascades resolve identity from the backfilled durable state.
  if v_team is null or not exists(select 1 from public.teams where id=v_team) then
    if tg_op='DELETE' then return old; end if;
    raise exception 'Attendance scope unavailable' using errcode='23514';
  end if;
  v_revision:=v_row.sync_revision+case when tg_op='DELETE' then 1 else 0 end;
  insert into public.mobile_workflow_attendance_state(team_id,event_id,member_id,actor_id,attendance_id,revision,deleted)
    values(v_team,v_row.event_id,v_row.team_member_id,v_actor,v_row.id,v_revision,tg_op='DELETE')
    on conflict(team_id,event_id,member_id) do update set attendance_id=excluded.attendance_id,revision=excluded.revision,
      deleted=excluded.deleted,changed_at=clock_timestamp()
    where public.mobile_workflow_attendance_state.revision<excluded.revision;
  if not found then raise exception 'Attendance revision changed; retry' using errcode='40001'; end if;
  insert into public.mobile_workflow_attendance_changes(team_id,event_id,member_id,actor_id,attendance_id,revision,operation)
    values(v_team,v_row.event_id,v_row.team_member_id,v_actor,v_row.id,v_revision,case when tg_op='DELETE' then 'delete' else 'upsert' end);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.mobile_workflow_attendance_revision(),private.mobile_workflow_attendance_change() from public,anon,authenticated;
create trigger attendance_workflow_revision before insert or update on public.attendance for each row execute function private.mobile_workflow_attendance_revision();
create trigger attendance_workflow_change after insert or update on public.attendance for each row execute function private.mobile_workflow_attendance_change();
create trigger attendance_workflow_delete before delete on public.attendance for each row execute function private.mobile_workflow_attendance_change();

create function private.validate_mobile_workflow_command(p_command jsonb) returns void language plpgsql set search_path='' as $$
declare v_key text; v_id uuid; v_dependency jsonb;
begin
  if p_command is null or jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>65536
    or not (p_command ?& array['commandId','type','eventId','baseRevision','baseValue','dependsOn'])
    or jsonb_typeof(p_command->'type') is distinct from 'string' or p_command->>'type' not in ('attendance.respond','event.review')
    or jsonb_typeof(p_command->'commandId') is distinct from 'string' or jsonb_typeof(p_command->'eventId') is distinct from 'string'
    or jsonb_typeof(p_command->'dependsOn') is distinct from 'array' or jsonb_array_length(p_command->'dependsOn')>25 then
    raise exception 'Invalid workflow command' using errcode='22023';
  end if;
  v_id:=(p_command->>'commandId')::uuid; v_id:=(p_command->>'eventId')::uuid;
  for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
    if jsonb_typeof(v_dependency)<>'string' then raise exception 'Invalid dependency' using errcode='22023'; end if;
    v_id:=(v_dependency#>>'{}')::uuid;
    if v_id=(p_command->>'commandId')::uuid then raise exception 'Self dependency' using errcode='22023'; end if;
  end loop;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(p_command->'dependsOn')) then raise exception 'Duplicate dependency' using errcode='22023'; end if;
  for v_key in select unnest(case when p_command->>'type'='attendance.respond' then array['baseRevision','baseEventRevision'] else array['baseRevision'] end) loop
    if jsonb_typeof(p_command->v_key) is distinct from 'number' or (p_command->>v_key)::numeric not between 0 and 9007199254740991
      or mod((p_command->>v_key)::numeric,1)<>0 then raise exception 'Invalid revision' using errcode='22023'; end if;
  end loop;
  if p_command->>'type'='attendance.respond' then
    if not(p_command ?& array['baseEventRevision','status']) or p_command-array['commandId','type','eventId','baseRevision','baseEventRevision','baseValue','status','dependsOn']<>'{}'
      or p_command->>'status' not in ('available','maybe','unavailable') or jsonb_typeof(p_command->'status') is distinct from 'string'
      or not(p_command->'baseValue'='null'::jsonb or (jsonb_typeof(p_command->'baseValue')='object'
        and (p_command->'baseValue')-array['status','note']='{}' and (p_command->'baseValue') ?& array['status','note']
        and jsonb_typeof(p_command->'baseValue'->'status')='string' and p_command->'baseValue'->>'status' in ('available','maybe','unavailable','pending')
        and jsonb_typeof(p_command->'baseValue'->'note') in ('string','null')))
      or ((p_command->>'baseRevision')::numeric=0 and p_command->'baseValue'<>'null'::jsonb) then
      raise exception 'Invalid attendance command' using errcode='22023';
    end if;
  elsif not(p_command ? 'decision') or p_command-array['commandId','type','eventId','baseRevision','baseValue','decision','dependsOn']<>'{}'
    or jsonb_typeof(p_command->'decision') is distinct from 'string' or p_command->>'decision' not in ('approved','rejected') or p_command->'baseValue'<>'{"approvalStatus":"pending"}'::jsonb then
    raise exception 'Invalid review command' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.validate_mobile_workflow_command(jsonb) from public,anon,authenticated;

create function private.apply_mobile_workflow_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid:=(p_command->>'commandId')::uuid; v_event public.events%rowtype;
  v_attendance public.attendance%rowtype; v_attendance_revision bigint:=0; v_own jsonb:='null'; v_event_state jsonb;
  v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex'); v_receipt public.mobile_workflow_command_receipts%rowtype;
  v_common jsonb; v_result jsonb; v_status text; v_base jsonb; v_dependency jsonb;
begin
  v_common:=jsonb_build_object('commandId',v_id,'type',p_command->>'type','eventId',p_command->>'eventId','payloadHash',v_hash);
  -- Workspace/member locks are already held by the public batch RPC. Resolve
  -- current visibility and action permission BEFORE returning a stored receipt.
  select * into v_event from public.events where id=(p_command->>'eventId')::uuid and team_id=p_team for update;
  if v_event.id is null or v_event.deleted_at is not null or not(private.is_approved_member(p_team) and
    (v_event.approval_status='approved' or v_event.created_by=v_actor or private.has_team_role(p_team,array['owner','admin']::public.team_role[]))) then
    v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This event is unavailable. Keep your local draft.');
  elsif p_command->>'type'='event.review' and not private.has_team_role(p_team,array['owner','admin']::public.team_role[]) then
    v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Only current owners and admins can review requests.');
  elsif p_command->>'type'='attendance.respond' and v_event.approval_status<>'approved' then
    v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Attendance opens after this event is approved.');
  end if;
  -- attendance.confirm is granted to every existing team_role in website rbac;
  -- it has no owner-editable override. The exact active actor/member is locked.
  if v_result is null then
    select * into v_receipt from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id;
    if found then
      if v_receipt.member_id<>p_member or v_receipt.payload_hash<>v_hash or v_receipt.command<>p_command then
        return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID already belongs to a different payload. Keep both drafts.');
      end if;
      return v_receipt.result;
    end if;
    for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
      if not exists(select 1 from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and member_id=p_member
        and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied') then
        v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required command is not confirmed. Keep this draft; retry with a new command ID after resolution.'); exit;
      end if;
    end loop;
  end if;
  if v_result is null then
    v_event_state:=jsonb_build_object('id',v_event.id,'revision',v_event.sync_revision,'approvalStatus',v_event.approval_status,'deleted',v_event.deleted_at is not null);
    if p_command->>'type'='attendance.respond' then
      select * into v_attendance from public.attendance where event_id=v_event.id and team_member_id=p_member for update;
      if v_attendance.id is not null then
        v_attendance_revision:=v_attendance.sync_revision;
        v_own:=jsonb_build_object('id',v_attendance.id,'eventId',v_event.id,'memberId',p_member,'revision',v_attendance.sync_revision,
          'status',v_attendance.status,'note',v_attendance.note,'respondedAt',v_attendance.responded_at);
        v_base:=jsonb_build_object('status',v_attendance.status,'note',v_attendance.note);
      else
        select coalesce(max(revision),0) into v_attendance_revision from public.mobile_workflow_attendance_state where team_id=p_team and event_id=v_event.id and member_id=p_member;
        v_base:='null';
      end if;
      if (p_command->>'baseEventRevision')::numeric<>v_event.sync_revision or (p_command->>'baseRevision')::numeric<>v_attendance_revision or p_command->'baseValue' is distinct from v_base then
        v_result:=v_common||jsonb_build_object('status','conflict','event',v_event_state,'attendance',v_own,'attendanceRevision',v_attendance_revision,
          'baseValue',p_command->'baseValue','localValue',jsonb_build_object('status',p_command->>'status'));
      else
        insert into public.attendance(event_id,team_member_id,status,responded_at)
          values(v_event.id,p_member,(p_command->>'status')::public.attendance_status,clock_timestamp())
          on conflict(event_id,team_member_id) do update set status=excluded.status,responded_at=excluded.responded_at returning * into v_attendance;
        v_own:=jsonb_build_object('id',v_attendance.id,'eventId',v_event.id,'memberId',p_member,'revision',v_attendance.sync_revision,
          'status',v_attendance.status,'note',v_attendance.note,'respondedAt',v_attendance.responded_at);
        v_result:=v_common||jsonb_build_object('status','applied','event',v_event_state,'attendance',v_own,'attendanceRevision',v_attendance.sync_revision);
      end if;
    elsif (p_command->>'baseRevision')::numeric<>v_event.sync_revision or v_event.approval_status<>'pending' then
      v_result:=v_common||jsonb_build_object('status','conflict','event',v_event_state,'attendance',null,'attendanceRevision',0,
        'baseValue',p_command->'baseValue','localValue',jsonb_build_object('decision',p_command->>'decision'));
    else
      -- Reuse the website's atomic review service, including proposal validation
      -- and assignment creation. Its events_revision trigger covers both callers.
      perform public.review_event_request(v_event.id,p_command->>'decision');
      select * into v_event from public.events where id=v_event.id and team_id=p_team;
      v_event_state:=jsonb_build_object('id',v_event.id,'revision',v_event.sync_revision,'approvalStatus',v_event.approval_status,'deleted',false);
      v_result:=v_common||jsonb_build_object('status','applied','event',v_event_state,'attendance',null,'attendanceRevision',0);
    end if;
  end if;
  -- Blocked/conflict/rejected outcomes are immutable receipts too. A resolution
  -- uses a new command ID, not a mutated payload or an old blocked receipt.
  insert into public.mobile_workflow_command_receipts(actor_id,team_id,member_id,command_id,event_id,command,payload_hash,result)
    values(v_actor,p_team,p_member,v_id,(p_command->>'eventId')::uuid,p_command,v_hash,v_result)
    on conflict(actor_id,team_id,command_id) do nothing;
  return v_result;
end;
$$;
revoke all on function private.apply_mobile_workflow_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_workflow_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_results jsonb:='[]'; v_index bigint; v_dependency jsonb;
begin
  if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Authentication and selected scope required' using errcode='42501'; end if;
  if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 25
    or octet_length(p_commands::text)>65536 then raise exception 'Invalid command batch' using errcode='22023'; end if;
  for v_command in select value from jsonb_array_elements(p_commands) loop perform private.validate_mobile_workflow_command(v_command); end loop;
  if (select count(*)<>count(distinct (value->>'commandId')::uuid) from jsonb_array_elements(p_commands)) then raise exception 'Duplicate command IDs' using errcode='22023'; end if;
  for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
    for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
      if exists(select 1 from jsonb_array_elements(p_commands) with ordinality as d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then
        raise exception 'Dependencies must precede their commands' using errcode='22023';
      end if;
    end loop;
  end loop;
  perform private.lock_workspace_members(p_team_id);
  if not exists(select 1 from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=auth.uid() and status='active') then
    raise exception 'Matching active workspace membership required' using errcode='42501';
  end if;
  for v_command in select value from jsonb_array_elements(p_commands) loop
    v_results:=v_results||jsonb_build_array(private.apply_mobile_workflow_command(p_team_id,p_member_id,v_command));
  end loop;
  return v_results;
end;
$$;
revoke all on function public.mobile_apply_workflow_commands(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mobile_apply_workflow_commands(uuid,uuid,jsonb) to authenticated;
commit;
