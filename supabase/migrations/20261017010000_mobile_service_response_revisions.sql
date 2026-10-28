-- DRAFT: additive revision/history support for existing website assignment RPCs.
-- No remote application. Deploy only with the reviewed mobile service release.
-- Forward recovery: retain revisions, tombstones and history; fix triggers forward.
-- Review response/history volume before deployment; this one-time backfill takes
-- schema/write locks and may need an operationally batched rollout at high volume.
begin;

alter table public.assignment_responses add column sync_revision bigint not null default 1
  check (sync_revision between 1 and 9007199254740991);

create table public.mobile_service_assignment_state (
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null, assignment_id uuid not null, member_id uuid not null, actor_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  deleted boolean not null, changed_at timestamptz not null default clock_timestamp(),
  primary key(assignment_id,member_id)
);
create index mobile_service_assignment_actor_event on public.mobile_service_assignment_state(actor_id,team_id,member_id,event_id,assignment_id);
-- Parent/assignment/member IDs deliberately do not cascade: tombstones must
-- survive ordinary assignment/event/member removal. Whole-team deletion purges them.
create table public.mobile_service_assignment_changes (
  cursor bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null, assignment_id uuid not null, member_id uuid not null, actor_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  operation text not null check(operation in ('upsert','delete')),
  value jsonb not null check(jsonb_typeof(value)='object' and value ?& array['state','note']
    and value-array['state','note']='{}'::jsonb and jsonb_typeof(value->'state')='string'
    and value->>'state' in ('pending','confirmed','declined') and jsonb_typeof(value->'note')='string'
    and length(value->>'note')<=500),
  created_at timestamptz not null default clock_timestamp()
);
create index mobile_service_assignment_changes_actor_cursor on public.mobile_service_assignment_changes(actor_id,team_id,member_id,cursor);
alter table public.mobile_service_assignment_state enable row level security;
alter table public.mobile_service_assignment_changes enable row level security;
revoke all on public.mobile_service_assignment_state,public.mobile_service_assignment_changes from public,anon,authenticated;
revoke all on sequence public.mobile_service_assignment_changes_cursor_seq from public,anon,authenticated;
grant select on public.mobile_service_assignment_state,public.mobile_service_assignment_changes to authenticated;
create policy mobile_service_assignment_state_own on public.mobile_service_assignment_state for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.team_members tm
    where tm.id=member_id and tm.team_id=mobile_service_assignment_state.team_id and tm.profile_id=(select auth.uid()) and tm.status='active'));
create policy mobile_service_assignment_changes_own on public.mobile_service_assignment_changes for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.team_members tm
    where tm.id=member_id and tm.team_id=mobile_service_assignment_changes.team_id and tm.profile_id=(select auth.uid()) and tm.status='active'));

do $$begin
  if exists(select 1 from public.assignment_responses r
    join public.event_assignments a on a.id=r.assignment_id join public.events e on e.id=a.event_id
    join public.team_members tm on tm.id=r.team_member_id where tm.team_id<>e.team_id) then
    raise exception 'Resolve cross-team assignment response data before migrating' using errcode='23514';
  end if;
end$$;
insert into public.mobile_service_assignment_state(team_id,event_id,assignment_id,member_id,actor_id,revision,deleted,changed_at)
  select e.team_id,a.event_id,a.id,r.team_member_id,tm.profile_id,r.sync_revision,false,r.updated_at
  from public.assignment_responses r join public.event_assignments a on a.id=r.assignment_id
  join public.events e on e.id=a.event_id join public.team_members tm on tm.id=r.team_member_id and tm.team_id=e.team_id;
insert into public.mobile_service_assignment_changes(team_id,event_id,assignment_id,member_id,actor_id,revision,operation,value)
  select s.team_id,s.event_id,s.assignment_id,s.member_id,s.actor_id,s.revision,'upsert',jsonb_build_object('state',r.state,'note',r.note)
  from public.mobile_service_assignment_state s join public.assignment_responses r on r.assignment_id=s.assignment_id and r.team_member_id=s.member_id;

create function private.mobile_service_response_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare v_previous bigint; v_existing bigint;
begin
  if tg_op='UPDATE' and (new.assignment_id<>old.assignment_id or new.team_member_id<>old.team_member_id) then
    raise exception 'Assignment response identity is immutable' using errcode='22023';
  end if;
  -- INSERT also runs before ON CONFLICT UPDATE. Do not publish state/history here.
  if tg_op='INSERT' then
    select r.sync_revision into v_existing from public.assignment_responses r where r.assignment_id=new.assignment_id for update;
  else v_existing:=old.sync_revision; end if;
  select s.revision into v_previous from public.mobile_service_assignment_state s
    where s.assignment_id=new.assignment_id and s.member_id=new.team_member_id for update;
  new.sync_revision:=greatest(coalesce(v_previous,0),coalesce(v_existing,0))+1;
  return new;
end;
$$;

create function private.mobile_service_response_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_event uuid; v_actor uuid; v_previous bigint; v_revision bigint; v_row public.assignment_responses%rowtype;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  if tg_op='DELETE' then
    select s.team_id,s.event_id,s.actor_id,s.revision into v_team,v_event,v_actor,v_previous
      from public.mobile_service_assignment_state s where s.assignment_id=v_row.assignment_id and s.member_id=v_row.team_member_id;
  else
    select e.team_id,a.event_id,tm.profile_id into v_team,v_event,v_actor
      from public.event_assignments a join public.events e on e.id=a.event_id
      join public.team_members tm on tm.id=v_row.team_member_id and tm.team_id=e.team_id where a.id=v_row.assignment_id;
  end if;
  -- Whole-team cascades already purge this scope. Ordinary parent/member cascades
  -- use the durable state, even after the referenced parent is no longer visible.
  if v_team is null or not exists(select 1 from public.teams where id=v_team) then
    if tg_op='DELETE' then return old; end if;
    raise exception 'Assignment response scope unavailable' using errcode='23514';
  end if;
  v_revision:=case when tg_op='DELETE' then greatest(v_row.sync_revision,coalesce(v_previous,0))+1 else v_row.sync_revision end;
  insert into public.mobile_service_assignment_state(team_id,event_id,assignment_id,member_id,actor_id,revision,deleted)
    values(v_team,v_event,v_row.assignment_id,v_row.team_member_id,v_actor,v_revision,tg_op='DELETE')
    on conflict(assignment_id,member_id) do update set team_id=excluded.team_id,event_id=excluded.event_id,actor_id=excluded.actor_id,
      revision=excluded.revision,deleted=excluded.deleted,changed_at=clock_timestamp()
    where public.mobile_service_assignment_state.revision<excluded.revision;
  if not found then raise exception 'Assignment response revision changed; retry' using errcode='40001'; end if;
  insert into public.mobile_service_assignment_changes(team_id,event_id,assignment_id,member_id,actor_id,revision,operation,value)
    values(v_team,v_event,v_row.assignment_id,v_row.team_member_id,v_actor,v_revision,
      case when tg_op='DELETE' then 'delete' else 'upsert' end,jsonb_build_object('state',v_row.state,'note',v_row.note));
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create function private.mobile_service_assignment_scope_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.event_id is distinct from new.event_id or old.team_member_id is distinct from new.team_member_id or old.assignment is distinct from new.assignment then
    -- Record the former response while the old assignment still supplies scope.
    delete from public.assignment_responses where assignment_id=old.id;
  end if;
  return new;
end;
$$;
revoke all on function private.mobile_service_response_revision(),private.mobile_service_response_change(),private.mobile_service_assignment_scope_change() from public,anon,authenticated;
create trigger assignment_response_revision before insert or update on public.assignment_responses for each row execute function private.mobile_service_response_revision();
create trigger assignment_response_change after insert or update on public.assignment_responses for each row execute function private.mobile_service_response_change();
create trigger assignment_response_delete before delete on public.assignment_responses for each row execute function private.mobile_service_response_change();
create trigger assignment_response_scope_change before update on public.event_assignments for each row execute function private.mobile_service_assignment_scope_change();

-- Older versions could leave a former member's response after reassignment.
-- Preserve its original value above and its deletion below, rather than silently
-- transferring that confirmation to the new member. The existing RPC stays intact.
delete from public.assignment_responses r using public.event_assignments a
  where r.assignment_id=a.id and r.team_member_id<>a.team_member_id;
commit;
