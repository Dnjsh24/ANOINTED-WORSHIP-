create table public.team_role_permissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role public.team_role not null,
  permissions text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, role),
  constraint team_role_permissions_non_owner_check check (role <> 'owner'),
  constraint team_role_permissions_values_check check (
    permissions <@ array[
      'team.manage',
      'members.manage',
      'join_requests.review',
      'announcements.create',
      'events.manage',
      'events.review',
      'events.request',
      'songs.create',
      'songs.edit',
      'songs.review',
      'songs.delete',
      'setlists.manage',
      'dance_notes.manage',
      'files.upload',
      'attendance.confirm',
      'messages.send',
      'prayer_requests.create'
    ]::text[]
  )
);

alter table public.team_role_permissions enable row level security;

revoke all on public.team_role_permissions from anon;
grant select, insert, update, delete on public.team_role_permissions to authenticated;

create policy "Active members can view team role permissions"
on public.team_role_permissions for select to authenticated
using (private.is_approved_member(team_id));

create policy "Team owners can create role permissions"
on public.team_role_permissions for insert to authenticated
with check (private.is_team_owner(team_id));

create policy "Team owners can update role permissions"
on public.team_role_permissions for update to authenticated
using (private.is_team_owner(team_id))
with check (private.is_team_owner(team_id));

create policy "Team owners can delete role permissions"
on public.team_role_permissions for delete to authenticated
using (private.is_team_owner(team_id));
