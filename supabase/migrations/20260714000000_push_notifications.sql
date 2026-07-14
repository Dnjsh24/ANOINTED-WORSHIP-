create extension if not exists pg_net with schema extensions;

create table if not exists public.user_push_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    token text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

create policy "Users can manage their own push tokens"
    on public.user_push_tokens for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create or replace function public.notify_new_message()
returns trigger as $$
declare
  payload jsonb;
  sender_name text;
begin
  -- Get sender name
  select p.first_name || ' ' || p.last_name into sender_name
  from public.team_members tm
  join public.profiles p on tm.user_id = p.id
  where tm.id = NEW.sender_member_id;

  -- Build payload using all tokens of members in this channel (excluding sender)
  select jsonb_agg(
    jsonb_build_object(
      'to', upt.token,
      'title', coalesce(mc.name, 'New message') || ' (' || coalesce(sender_name, 'someone') || ')',
      'body', NEW.body,
      'sound', 'default',
      'data', jsonb_build_object('type', 'message', 'channel_id', NEW.channel_id)
    )
  ) into payload
  from public.user_push_tokens upt
  join public.team_members tm on tm.user_id = upt.user_id
  join public.message_channels mc on mc.id = NEW.channel_id
  where tm.team_id = mc.team_id
    and tm.id != NEW.sender_member_id
    and (
      mc.channel_type = 'team'
      or exists (
        select 1 from public.message_channel_members mcm 
        where mcm.channel_id = NEW.channel_id and mcm.member_id = tm.id
      )
    );

  if payload is not null then
    perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := payload
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_notify_new_message
after insert on public.messages
for each row execute function public.notify_new_message();

-- Same for events
create or replace function public.notify_new_event()
returns trigger as $$
declare
  payload jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'to', upt.token,
      'title', 'New Event Scheduled',
      'body', NEW.name || ' on ' || NEW.event_date::text,
      'sound', 'default',
      'data', jsonb_build_object('type', 'event', 'event_id', NEW.id)
    )
  ) into payload
  from public.user_push_tokens upt
  join public.team_members tm on tm.user_id = upt.user_id
  where tm.team_id = NEW.team_id;

  if payload is not null then
    perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := payload
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_notify_new_event
after insert on public.events
for each row execute function public.notify_new_event();
