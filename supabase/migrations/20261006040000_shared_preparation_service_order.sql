-- Shared plans are leader-owned documents. Personal responses are separately
-- authorized and never change a team's approved plan or another member's data.
create table public.rehearsal_plans (
  setlist_id uuid primary key references public.setlists(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  allocations jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.rehearsal_task_responses (
  setlist_id uuid not null references public.rehearsal_plans(setlist_id) on delete cascade,
  task_key text not null,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (setlist_id, task_key, team_member_id)
);
create table public.song_readiness (
  event_id uuid not null references public.events(id) on delete cascade,
  slot_id uuid not null references public.setlist_songs(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  state text not null check (state in ('not_started','practicing','ready','needs_help')),
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (event_id, slot_id, team_member_id)
);
create table public.service_orders (
  event_id uuid primary key references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  entries jsonb not null default '[]'::jsonb,
  required_roles text[] not null default '{}',
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.assignment_responses (
  assignment_id uuid primary key references public.event_assignments(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  state text not null check (state in ('pending','confirmed','declined')),
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now()
);
create index rehearsal_plans_team_idx on public.rehearsal_plans(team_id);
create index service_orders_team_idx on public.service_orders(team_id);
create index readiness_member_idx on public.song_readiness(team_member_id,event_id);
create index assignment_responses_member_idx on public.assignment_responses(team_member_id);

alter table public.rehearsal_plans enable row level security;
alter table public.rehearsal_task_responses enable row level security;
alter table public.song_readiness enable row level security;
alter table public.service_orders enable row level security;
alter table public.assignment_responses enable row level security;
revoke all on public.rehearsal_plans, public.rehearsal_task_responses, public.song_readiness,
  public.service_orders, public.assignment_responses from public, anon, authenticated;
grant select on public.rehearsal_plans, public.rehearsal_task_responses, public.song_readiness,
  public.service_orders, public.assignment_responses to authenticated;
create policy "Active team can read rehearsal plans" on public.rehearsal_plans for select to authenticated
  using (private.is_approved_member(team_id));
create policy "Active team can read preparation checks" on public.rehearsal_task_responses for select to authenticated
  using (exists (select 1 from public.rehearsal_plans p where p.setlist_id = rehearsal_task_responses.setlist_id));
create policy "Active team can read service orders" on public.service_orders for select to authenticated
  using (private.is_approved_member(team_id));
create policy "Active team can read song readiness" on public.song_readiness for select to authenticated
  using (exists (select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
    join public.events e on e.id=s.event_id and e.id=song_readiness.event_id
    where ss.id=song_readiness.slot_id and private.is_approved_member(s.team_id)));
create policy "Active team can read assignment responses" on public.assignment_responses for select to authenticated
  using (exists (select 1 from public.event_assignments a join public.events e on e.id=a.event_id
    where a.id=assignment_responses.assignment_id and private.is_approved_member(e.team_id)));

-- These helpers are callable only from explicitly authorized public RPCs and
-- later typed request adapters. No caller-selected SQL/table/column is executed.
create function private.apply_rehearsal_plan(p_setlist_id uuid, p_expected_revision integer, p_allocations jsonb, p_tasks jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision integer; v_next integer; v_allowed text[] := array[
  'Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions',
  'Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs',
  'Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues'];
begin
  -- Member references precede workspace locks, as in save_event_workspace.
  if coalesce(jsonb_typeof(p_allocations),'')<>'array' or jsonb_array_length(p_allocations)>200
    or coalesce(jsonb_typeof(p_tasks),'')<>'array' or jsonb_array_length(p_tasks)<>10
    or octet_length(p_allocations::text)>200000 or octet_length(p_tasks::text)>10000 then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  select team_id into v_team from public.setlists where id=p_setlist_id and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'setlists.manage') then
    raise exception 'Plan editing requires a setlist manager' using errcode='42501';
  end if;
  if not private.is_approved_member(v_team) then raise exception 'Active membership required' using errcode='42501'; end if;
  select team_id into v_team from public.setlists where id=p_setlist_id and deleted_at is null for update;
  if v_team is null then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  select revision into v_revision from public.rehearsal_plans where setlist_id=p_setlist_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(v_revision,0) then
    raise exception 'Plan changed. Reload before saving; keep your draft.' using errcode='40001';
  end if;
  if coalesce(jsonb_typeof(p_allocations),'')<>'array' or jsonb_array_length(p_allocations)>200
    or coalesce(jsonb_typeof(p_tasks),'')<>'array' or jsonb_array_length(p_tasks)<>10
    or octet_length(p_allocations::text)>200000 or octet_length(p_tasks::text)>10000 then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  perform 1 from public.setlist_songs ss where ss.setlist_id=p_setlist_id and
    ss.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(p_allocations) x) order by ss.id for share;
  if exists (select 1 from jsonb_array_elements(p_allocations) x
    where jsonb_typeof(x)<>'object' or coalesce(jsonb_typeof(x->'minutes'),'')<>'number'
      or x-array['slot_id','minutes','focus']<>'{}'::jsonb
      or (x->>'minutes')::numeric not between 0 and 120 or (x->>'minutes')::numeric<>trunc((x->>'minutes')::numeric)
      or coalesce(jsonb_typeof(x->'focus'),'')<>'string' or length(x->>'focus')>500
      or not exists(select 1 from public.setlist_songs ss where ss.id=(x->>'slot_id')::uuid and ss.setlist_id=p_setlist_id and ss.deleted_at is null))
    or (select count(*)<>count(distinct x->>'slot_id') from jsonb_array_elements(p_allocations) x)
    or exists(select 1 from jsonb_array_elements(p_tasks) x where jsonb_typeof(x)<>'object'
      or x-array['key','assignee_member_id']<>'{}'::jsonb
      or coalesce(x->>'key','')<>all(v_allowed)
      or (x->>'assignee_member_id' is not null and not exists(select 1 from public.team_members tm
        where tm.id=(x->>'assignee_member_id')::uuid and tm.team_id=v_team and tm.status='active')))
    or (select count(distinct x->>'key')<>10 from jsonb_array_elements(p_tasks) x) then
    raise exception 'Invalid slots, allocations or task assignees' using errcode='22023';
  end if;
  v_next:=coalesce(v_revision,0)+1;
  insert into public.rehearsal_plans(setlist_id,team_id,revision,allocations,tasks,updated_by)
    values(p_setlist_id,v_team,v_next,p_allocations,p_tasks,auth.uid())
    on conflict(setlist_id) do update set revision=v_next,allocations=p_allocations,tasks=p_tasks,updated_by=auth.uid(),updated_at=now();
  delete from public.rehearsal_task_responses r where r.setlist_id=p_setlist_id and not exists(
    select 1 from jsonb_array_elements(p_tasks) x where x->>'key'=r.task_key and (x->>'assignee_member_id')::uuid=r.team_member_id);
  return v_next;
end;
$$;
revoke all on function private.apply_rehearsal_plan(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
create function public.save_rehearsal_plan(p_setlist_id uuid,p_expected_revision integer,p_allocations jsonb,p_tasks jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.setlists where id=p_setlist_id;
  if auth.uid() is null or v_team is null or not private.has_workspace_permission(v_team,'setlists.manage') then
    raise exception 'Plan editing requires a setlist manager' using errcode='42501';
  end if;
  return private.apply_rehearsal_plan(p_setlist_id,p_expected_revision,p_allocations,p_tasks);
end;
$$;
revoke all on function public.save_rehearsal_plan(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_rehearsal_plan(uuid,integer,jsonb,jsonb) to authenticated;

create function public.respond_preparation_task(p_setlist_id uuid,p_task_key text,p_completed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_plan public.rehearsal_plans%rowtype;
begin
  select * into v_plan from public.rehearsal_plans where setlist_id=p_setlist_id;
  perform private.lock_workspace_members(v_plan.team_id);
  select id into v_member from public.team_members where team_id=v_plan.team_id and profile_id=auth.uid() and status='active' for share;
  perform 1 from public.setlists where id=p_setlist_id and team_id=v_plan.team_id and deleted_at is null for share;
  if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  select * into v_plan from public.rehearsal_plans where setlist_id=p_setlist_id for share;
  if v_member is null or p_completed is null or not exists(select 1 from jsonb_array_elements(v_plan.tasks) x
    where x->>'key'=p_task_key and (x->>'assignee_member_id')::uuid=v_member) then
    raise exception 'Only the assigned member can respond' using errcode='42501';
  end if;
  insert into public.rehearsal_task_responses(setlist_id,task_key,team_member_id,completed)
    values(p_setlist_id,p_task_key,v_member,p_completed)
    on conflict(setlist_id,task_key,team_member_id) do update set completed=p_completed,updated_at=now();
end;
$$;
revoke all on function public.respond_preparation_task(uuid,text,boolean) from public,anon;
grant execute on function public.respond_preparation_task(uuid,text,boolean) to authenticated;

create function public.respond_song_readiness(p_slot_id uuid,p_state text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_event uuid; v_team uuid; v_setlist uuid;
begin
  select setlist_id into v_setlist from public.setlist_songs where id=p_slot_id and deleted_at is null;
  select team_id into v_team from public.setlists where id=v_setlist and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  select id into v_member from public.team_members where team_id=v_team and profile_id=auth.uid() and status='active' for share;
  select event_id,team_id into v_event,v_team from public.setlists
    where id=v_setlist and deleted_at is null for share;
  perform 1 from public.setlist_songs where id=p_slot_id and setlist_id=v_setlist and deleted_at is null for share;
  if not found then raise exception 'Song slot unavailable' using errcode='42501'; end if;
  perform 1 from public.events where id=v_event and team_id=v_team
    and approval_status='approved' and deleted_at is null for share;
  if not found or v_member is null then
    raise exception 'Readiness requires an approved linked event and your assignment' using errcode='42501';
  end if;
  perform 1 from public.event_assignments where event_id=v_event and team_member_id=v_member order by id for share;
  if not found then
    raise exception 'Readiness requires an approved linked event and your assignment' using errcode='42501';
  end if;
  if p_state is null or p_state not in ('not_started','practicing','ready','needs_help') or p_note is null or length(p_note)>500 then
    raise exception 'Invalid readiness response' using errcode='22023';
  end if;
  insert into public.song_readiness(event_id,slot_id,team_member_id,state,note) values(v_event,p_slot_id,v_member,p_state,p_note)
    on conflict(event_id,slot_id,team_member_id) do update set state=p_state,note=p_note,updated_at=now();
end;
$$;
revoke all on function public.respond_song_readiness(uuid,text,text) from public,anon;
grant execute on function public.respond_song_readiness(uuid,text,text) to authenticated;

create function private.apply_service_order(p_event_id uuid,p_expected_revision integer,p_entries jsonb,p_required_roles text[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision integer; v_next integer;
begin
  -- Match the workspace RPC lock order: related setlists before their event.
  if coalesce(jsonb_typeof(p_entries),'')<>'array' or jsonb_array_length(p_entries)>200 or octet_length(p_entries::text)>500000 then
    raise exception 'Invalid service order' using errcode='22023';
  end if;
  select team_id into v_team from public.events where id=p_event_id;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'events.manage') then
    raise exception 'Service order editing requires an event manager' using errcode='42501';
  end if;
  if not private.is_approved_member(v_team) then raise exception 'Active membership required' using errcode='42501'; end if;
  perform 1 from public.setlists where event_id=p_event_id order by id for update;
  select team_id into v_team from public.events where id=p_event_id and approval_status='approved' and deleted_at is null for update;
  if v_team is null then raise exception 'Approved event unavailable' using errcode='42501'; end if;
  select revision into v_revision from public.service_orders where event_id=p_event_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(v_revision,0) then
    raise exception 'Service order changed. Reload before saving; keep your draft.' using errcode='40001';
  end if;
  if coalesce(jsonb_typeof(p_entries),'')<>'array' or jsonb_array_length(p_entries)>200 or octet_length(p_entries::text)>500000
    or p_required_roles is null or cardinality(p_required_roles)>30
    or exists(select 1 from unnest(p_required_roles) r where r is null or length(trim(r)) not between 1 and 80)
    or (select count(*)<>count(distinct r) from unnest(p_required_roles) r) then
    raise exception 'Invalid service order' using errcode='22023';
  end if;
  perform 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
    where s.event_id=p_event_id and s.team_id=v_team and
      ss.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(p_entries) x) order by ss.id for share of ss;
  if exists(select 1 from jsonb_array_elements(p_entries) x where jsonb_typeof(x)<>'object'
    or x-array['id','kind','title','slot_id','duration_seconds','responsible_member_id','cue']<>'{}'::jsonb
    or coalesce(x->>'kind','') not in ('song','prayer','reading','announcement','media','other')
    or x->>'id' is null or (x->>'id')::uuid is null
    or length(trim(coalesce(x->>'title',''))) not between 1 and 160
    or coalesce(jsonb_typeof(x->'duration_seconds'),'')<>'number'
    or (x->>'duration_seconds')::numeric not between 0 and 7200 or (x->>'duration_seconds')::numeric<>trunc((x->>'duration_seconds')::numeric)
    or coalesce(jsonb_typeof(x->'cue'),'')<>'string' or length(x->>'cue')>2000
    or (x->>'responsible_member_id' is not null and not exists(select 1 from public.team_members tm
      where tm.id=(x->>'responsible_member_id')::uuid and tm.team_id=v_team and tm.status='active'))
    or ((x->>'kind'='song') is distinct from (x->>'slot_id' is not null))
    or (x->>'slot_id' is not null and not exists(select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
      where ss.id=(x->>'slot_id')::uuid and s.event_id=p_event_id and s.team_id=v_team and s.deleted_at is null and ss.deleted_at is null)))
    or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_entries) x) then
    raise exception 'Invalid order items, songs or responsible members' using errcode='22023';
  end if;
  v_next:=coalesce(v_revision,0)+1;
  insert into public.service_orders(event_id,team_id,revision,entries,required_roles,updated_by)
    values(p_event_id,v_team,v_next,p_entries,p_required_roles,auth.uid())
    on conflict(event_id) do update set revision=v_next,entries=p_entries,required_roles=p_required_roles,updated_by=auth.uid(),updated_at=now();
  return v_next;
end;
$$;
revoke all on function private.apply_service_order(uuid,integer,jsonb,text[]) from public,anon,authenticated;
create function public.save_service_order(p_event_id uuid,p_expected_revision integer,p_entries jsonb,p_required_roles text[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.events where id=p_event_id;
  if auth.uid() is null or v_team is null or not private.has_workspace_permission(v_team,'events.manage') then
    raise exception 'Service order editing requires an event manager' using errcode='42501';
  end if;
  return private.apply_service_order(p_event_id,p_expected_revision,p_entries,p_required_roles);
end;
$$;
revoke all on function public.save_service_order(uuid,integer,jsonb,text[]) from public,anon;
grant execute on function public.save_service_order(uuid,integer,jsonb,text[]) to authenticated;

create function public.respond_assignment(p_assignment_id uuid,p_state text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_event uuid; v_team uuid;
begin
  select event_id into v_event from public.event_assignments where id=p_assignment_id;
  select team_id into v_team from public.events where id=v_event and approval_status='approved' and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  select tm.id into v_member from public.event_assignments a
    join public.team_members tm on tm.id=a.team_member_id and tm.team_id=v_team
    where a.id=p_assignment_id and a.event_id=v_event and tm.profile_id=auth.uid() and tm.status='active'
    for share of tm;
  if v_member is null then raise exception 'Only the assigned member can respond' using errcode='42501'; end if;
  perform 1 from public.events where id=v_event and team_id=v_team and approval_status='approved' and deleted_at is null for share;
  if not found then raise exception 'Assignment event changed; reload before responding' using errcode='42501'; end if;
  perform 1 from public.event_assignments where id=p_assignment_id and event_id=v_event and team_member_id=v_member for share;
  if not found then raise exception 'Assignment changed; reload before responding' using errcode='42501'; end if;
  if p_state is null or p_state not in ('pending','confirmed','declined') or p_note is null or length(p_note)>500 then
    raise exception 'Invalid assignment response' using errcode='22023';
  end if;
  insert into public.assignment_responses(assignment_id,team_member_id,state,note) values(p_assignment_id,v_member,p_state,p_note)
    on conflict(assignment_id) do update set team_member_id=v_member,state=p_state,note=p_note,updated_at=now();
end;
$$;
revoke all on function public.respond_assignment(uuid,text,text) from public,anon;
grant execute on function public.respond_assignment(uuid,text,text) to authenticated;
