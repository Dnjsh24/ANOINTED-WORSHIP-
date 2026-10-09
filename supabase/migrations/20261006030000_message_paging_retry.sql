-- Bound inbox previews and make authenticated retryable sends idempotent.
alter table public.messages add column if not exists client_nonce uuid;
create unique index if not exists messages_sender_nonce_idx
  on public.messages (sender_member_id, client_nonce) where client_nonce is not null;
create index if not exists messages_channel_cursor_idx
  on public.messages (channel_id, created_at desc, id desc);

create or replace function public.get_message_previews(p_channel_ids uuid[])
returns table (channel_id uuid, message jsonb)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in to read messages';
  end if;
  if coalesce(cardinality(p_channel_ids), 0) > 50 then
    raise exception using errcode = '22023', message = 'At most 50 channels may be requested';
  end if;
  return query
    select c.id, to_jsonb(latest)
    from public.message_channels c
    left join lateral (
      select m.* from public.messages m where m.channel_id = c.id
      order by m.created_at desc, m.id desc limit 1
    ) latest on true
    where c.id = any(p_channel_ids)
      and exists (
        select 1 from public.message_channel_members cm
        join public.team_members tm on tm.id = cm.team_member_id
        where cm.channel_id = c.id and tm.team_id = c.team_id
          and tm.profile_id = auth.uid() and tm.status = 'active'
      )
    order by c.id;
end;
$$;
revoke all on function public.get_message_previews(uuid[]) from public, anon;
grant execute on function public.get_message_previews(uuid[]) to authenticated;

create or replace function public.send_message_once(
  p_channel_id uuid, p_client_nonce uuid, p_body text,
  p_attachment_file_id uuid default null,
  p_scheduled_for timestamptz default null,
  p_parent_message_id uuid default null
)
returns table (id uuid, created_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
declare
  member_id uuid;
  channel_team uuid;
  existing public.messages%rowtype;
begin
  if auth.uid() is null or p_client_nonce is null then
    raise exception using errcode = '42501', message = 'A signed-in send identity is required';
  end if;
  select tm.id, c.team_id into member_id, channel_team
  from public.message_channels c
  join public.message_channel_members cm on cm.channel_id = c.id
  join public.team_members tm on tm.id = cm.team_member_id and tm.team_id = c.team_id
  where c.id = p_channel_id and tm.profile_id = auth.uid() and tm.status = 'active';
  if member_id is null then
    raise exception using errcode = '42501', message = 'This conversation is unavailable';
  end if;

  select m.* into existing from public.messages m
  where m.sender_member_id = member_id and m.client_nonce = p_client_nonce;
  if not found then
    if coalesce(length(btrim(p_body)), 0) not between 1 and 20000 then
      raise exception using errcode = '22023', message = 'Message text is invalid';
    end if;
    if p_attachment_file_id is not null and not exists (
      select 1 from public.practice_files f
      where f.id = p_attachment_file_id and f.team_id = channel_team
    ) then
      raise exception using errcode = '42501', message = 'Attachment is unavailable';
    end if;
    if p_parent_message_id is not null and not exists (
      select 1 from public.messages m where m.id = p_parent_message_id and m.channel_id = p_channel_id
    ) then
      raise exception using errcode = '42501', message = 'Reply is unavailable';
    end if;
    insert into public.messages (
      channel_id, sender_member_id, body, attachment_file_id,
      scheduled_for, is_delivered, parent_message_id, client_nonce
    ) values (
      p_channel_id, member_id, p_body, p_attachment_file_id,
      p_scheduled_for, p_scheduled_for is null, p_parent_message_id, p_client_nonce
    ) on conflict (sender_member_id, client_nonce) where client_nonce is not null do nothing;
    select m.* into existing from public.messages m
    where m.sender_member_id = member_id and m.client_nonce = p_client_nonce;
  end if;
  if existing.channel_id is distinct from p_channel_id
     or existing.body is distinct from p_body
     or existing.attachment_file_id is distinct from p_attachment_file_id
     or existing.scheduled_for is distinct from p_scheduled_for
     or existing.parent_message_id is distinct from p_parent_message_id then
    raise exception using errcode = '22023', message = 'Send identity already belongs to a different message';
  end if;
  return query select existing.id, existing.created_at;
end;
$$;
revoke all on function public.send_message_once(uuid, uuid, text, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.send_message_once(uuid, uuid, text, uuid, timestamptz, uuid) to authenticated;
