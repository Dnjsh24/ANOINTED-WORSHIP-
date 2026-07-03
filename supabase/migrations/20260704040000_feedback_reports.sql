create table if not exists public.feedback_reports (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  report_type text not null check (report_type in ('bug', 'improvement')),
  title text not null,
  description text not null default '',
  page_url text not null default '',
  created_at timestamptz default now() not null
);

alter table public.feedback_reports enable row level security;

create policy "members can insert feedback reports"
  on public.feedback_reports for insert
  with check (
    team_id in (
      select team_id from public.team_members
      where profile_id = auth.uid()
        and status = 'active'
    )
  );

create policy "owners and admins can view feedback reports"
  on public.feedback_reports for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = feedback_reports.team_id
        and profile_id = auth.uid()
        and role in ('owner', 'admin')
        and status = 'active'
    )
  );

create index if not exists idx_feedback_reports_team
  on public.feedback_reports (team_id, created_at desc);
