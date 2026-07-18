-- ============================================================
-- Security Advisor Fixes
-- 1. Harden notify_new_message trigger function:
--    - Set search_path = '' to prevent mutable search_path exploit
--    - Revoke EXECUTE from anon & authenticated (trigger-only, not an RPC)
--    - Qualify all table references with their schemas
-- 2. Harden notify_new_event trigger function (same reasons)
-- 3. Remove broad SELECT policy on presentation-media storage bucket
--    (public bucket URL access works without it; the policy allows listing)
-- ============================================================

-- -------------------------------------------------------
-- 1 & 2. Harden trigger functions
-- -------------------------------------------------------

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
$$ language plpgsql
   security definer
   set search_path = '';

-- Revoke public/anon/authenticated EXECUTE — this is a trigger function only
revoke all on function public.notify_new_message() from public, anon, authenticated;

-- -------------------------------------------------------

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
  join public.team_members tm on tm.profile_id = upt.user_id
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
$$ language plpgsql
   security definer
   set search_path = '';

-- Revoke public/anon/authenticated EXECUTE — this is a trigger function only
revoke all on function public.notify_new_event() from public, anon, authenticated;

-- -------------------------------------------------------
-- 3. Remove broad SELECT policy on presentation-media bucket
--    The bucket is already public=true, so object URLs continue to
--    work without a storage.objects SELECT policy. Removing this
--    policy prevents clients from listing the bucket's contents.
-- -------------------------------------------------------
drop policy if exists "Public can read presentation media" on storage.objects;
