-- Additive personal checkpoints. No membership is required, so onboarding works before joining a team.
begin;

create table public.wooly_tutorial_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tour_id text not null,
  version integer not null check (version = 1),
  status text not null check (status in ('offered', 'in_progress', 'paused', 'skipped', 'completed')),
  next_step text not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, tour_id, version),
  constraint wooly_tutorial_valid_step check (
    (tour_id = 'joining' and next_step in ('welcome', 'code', 'preview', 'role', 'request')) or
    (tour_id = 'creating' and next_step in ('details', 'invites', 'review')) or
    (tour_id = 'essentials' and next_step in ('welcome', 'home', 'setlists', 'timeline', 'messages', 'profile', 'finish'))
  )
);

alter table public.wooly_tutorial_progress enable row level security;
revoke all on public.wooly_tutorial_progress from public, anon, authenticated;
grant select, insert, update on public.wooly_tutorial_progress to authenticated;
grant all on public.wooly_tutorial_progress to service_role;

create policy wooly_read_own on public.wooly_tutorial_progress for select to authenticated
  using (profile_id = (select auth.uid()));
create policy wooly_insert_own on public.wooly_tutorial_progress for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy wooly_update_own on public.wooly_tutorial_progress for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create or replace function private.preserve_wooly_tutorial_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.profile_id, new.tour_id, new.version) is distinct from (old.profile_id, old.tour_id, old.version) then
      raise exception 'Tutorial checkpoint identity cannot change';
    end if;
    -- Row locking in UPDATE/ON CONFLICT makes this guard atomic across tabs and devices.
    -- Terminal progress is permanent for this version; replay is a client-only view.
    if old.status in ('skipped', 'completed') or (new.status = 'offered' and old.status <> 'offered') then
      return old;
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke execute on function private.preserve_wooly_tutorial_progress() from public, anon, authenticated;
create trigger preserve_wooly_tutorial_progress before insert or update on public.wooly_tutorial_progress
  for each row execute function private.preserve_wooly_tutorial_progress();

commit;
