create or replace function private.is_team_owner(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = target_team_id
      and t.owner_id = (select auth.uid())
  );
$$;

drop policy if exists "Owners can add themselves as first member" on public.team_members;

create policy "Owners can add themselves as first member"
on public.team_members for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and role = 'owner'::public.team_role
  and status = 'active'::public.member_status
  and private.is_team_owner(team_id)
);
