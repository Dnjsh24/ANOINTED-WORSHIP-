-- Fix column typo in notify_new_message trigger
-- (It incorrectly referenced mcm.member_id instead of mcm.team_member_id)

create or replace function public.notify_new_message()
returns trigger as $$
declare
  payload jsonb;
  sender_name text;
begin
  -- Get sender name (profiles has full_name instead of first_name/last_name)
  select p.full_name into sender_name
  from public.team_members tm
  join public.profiles p on tm.profile_id = p.id
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
  join public.team_members tm on tm.profile_id = upt.user_id
  join public.message_channels mc on mc.id = NEW.channel_id
  where tm.team_id = mc.team_id
    and tm.id != NEW.sender_member_id
    and (
      mc.channel_type = 'team'
      or exists (
        select 1 from public.message_channel_members mcm
        where mcm.channel_id = NEW.channel_id and mcm.team_member_id = tm.id
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
$$ language plpgsql set search_path = '';
