alter type public.join_request_status add value if not exists 'canceled';

drop policy if exists "Users can cancel own pending join requests" on public.join_requests;

create policy "Users can cancel own pending join requests"
on public.join_requests for update to authenticated
using (
  profile_id = (select auth.uid())
  and status::text = 'pending'
)
with check (
  profile_id = (select auth.uid())
  and status::text = 'canceled'
);

create or replace function public.notify_join_request_canceled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_name text;
begin
  if old.status::text = 'pending' and new.status::text = 'canceled' then
    select coalesce(nullif(p.full_name, ''), p.email, 'A member')
    into requester_name
    from public.profiles p
    where p.id = new.profile_id;

    insert into public.notifications (
      team_id,
      profile_id,
      title,
      body,
      target_path,
      priority,
      target_label,
      created_by
    )
    select
      new.team_id,
      tm.profile_id,
      'Join request canceled',
      coalesce(requester_name, 'A member') || ' canceled their request to join your team.',
      '/members/requests',
      'normal',
      'Admins',
      new.profile_id
    from public.team_members tm
    where tm.team_id = new.team_id
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
      and tm.profile_id <> new.profile_id;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_join_request_canceled() from public;

drop trigger if exists join_requests_notify_canceled on public.join_requests;
create trigger join_requests_notify_canceled
after update of status on public.join_requests
for each row execute function public.notify_join_request_canceled();
