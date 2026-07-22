-- Feature 24: Setlist Templates
create table if not exists public.setlist_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  description text,
  slots jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Feature 32: Message Threading
alter table public.messages add column if not exists parent_message_id uuid references public.messages(id) on delete set null;
create index if not exists messages_parent_idx on public.messages(parent_message_id);

-- Feature 39: Custom Roles & Permissions
create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  permissions text[] not null default '{}',
  created_at timestamptz default now(),
  unique(team_id, name)
);
alter table public.team_members add column if not exists custom_role_id uuid references public.custom_roles(id);

-- Feature 47: Push Subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  subscription jsonb not null,
  created_at timestamptz default now()
);
