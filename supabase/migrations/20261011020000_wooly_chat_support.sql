-- Additive, optional Wooly support. No account is automatically made support.
begin;

create table public.wooly_support_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.wooly_support_requests (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  question text not null check (char_length(btrim(question)) between 1 and 1000),
  details text not null default '' check (char_length(details) <= 2000),
  page_path text not null check (page_path ~ '^/([A-Za-z0-9/_-]*)$' and page_path !~ '^//' and char_length(page_path) <= 250),
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  requester_read_at timestamptz not null default now(),
  support_updated_at timestamptz
);
create table public.wooly_support_messages (
  id uuid primary key,
  request_id uuid not null references public.wooly_support_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_kind text not null check (author_kind in ('requester','support')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create table public.wooly_help_articles (
  id uuid primary key,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  keywords text not null check (char_length(btrim(keywords)) between 1 and 500),
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  audience text not null check (audience in ('everyone','before-team','team','managers')),
  route text check (route ~ '^/([A-Za-z0-9/_-]*)$' and route !~ '^//' and char_length(route) <= 150),
  published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index wooly_requests_owner on public.wooly_support_requests(profile_id, updated_at desc);
create index wooly_requests_queue on public.wooly_support_requests(status, created_at);
create index wooly_messages_thread on public.wooly_support_messages(request_id, created_at);
create index wooly_messages_author_time on public.wooly_support_messages(author_id, created_at);
create index wooly_articles_published on public.wooly_help_articles(published);

alter table public.wooly_support_accounts enable row level security;
alter table public.wooly_support_requests enable row level security;
alter table public.wooly_support_messages enable row level security;
alter table public.wooly_help_articles enable row level security;
revoke all on public.wooly_support_accounts, public.wooly_support_requests, public.wooly_support_messages, public.wooly_help_articles from public, anon, authenticated;
grant all on public.wooly_support_accounts, public.wooly_support_requests, public.wooly_support_messages, public.wooly_help_articles to service_role;
grant select on public.wooly_support_requests, public.wooly_support_messages, public.wooly_help_articles to authenticated;
grant select on public.wooly_help_articles to anon;

create function private.wooly_is_support() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.wooly_support_accounts where profile_id = (select auth.uid()));
$$;
revoke all on function private.wooly_is_support() from public, anon, authenticated;
grant execute on function private.wooly_is_support() to authenticated;
create function public.is_wooly_support() returns boolean language sql stable security definer set search_path = '' as $$
  select private.wooly_is_support();
$$;
revoke all on function public.is_wooly_support() from public, anon, authenticated;
grant execute on function public.is_wooly_support() to authenticated;

create policy wooly_requests_read on public.wooly_support_requests for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.wooly_is_support()));
create policy wooly_messages_read on public.wooly_support_messages for select to authenticated
  using (exists(select 1 from public.wooly_support_requests r where r.id = request_id and (r.profile_id = (select auth.uid()) or (select private.wooly_is_support()))));
-- Published articles are deliberately general website instructions, never private
-- team facts. The application also filters their help audience before answering.
create policy wooly_articles_public on public.wooly_help_articles for select to anon using (published and audience = 'everyone');
create policy wooly_articles_read on public.wooly_help_articles for select to authenticated using (published or (select private.wooly_is_support()));

create function public.wooly_unread_count() returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.wooly_support_requests
    where profile_id = (select auth.uid()) and support_updated_at > requester_read_at;
$$;
revoke all on function public.wooly_unread_count() from public, anon, authenticated;
grant execute on function public.wooly_unread_count() to authenticated;

create function public.create_wooly_support_request(p_id uuid, p_question text, p_details text, p_page_path text, p_team_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.wooly_support_requests;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if p_team_id is not null and not private.is_approved_member(p_team_id) then raise exception 'Team access denied'; end if;
  -- Enforce write limits even if an authenticated caller invokes the RPC directly.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 17));
  if not exists(select 1 from public.wooly_support_requests where id = p_id) and
    (select count(*) from public.wooly_support_requests where profile_id = actor and created_at > clock_timestamp() - interval '1 minute') >= 5 then
    raise exception 'Please wait before submitting another question';
  end if;
  insert into public.wooly_support_requests(id,profile_id,team_id,question,details,page_path)
    values(p_id,actor,p_team_id,btrim(p_question),btrim(p_details),p_page_path) on conflict (id) do nothing;
  select * into existing from public.wooly_support_requests where id = p_id;
  if existing.profile_id <> actor or existing.question <> btrim(p_question) or existing.details <> btrim(p_details) or existing.page_path <> p_page_path or existing.team_id is distinct from p_team_id then
    raise exception 'Request identity conflict';
  end if;
  return p_id;
end;
$$;

create function public.reply_wooly_support(p_request_id uuid, p_id uuid, p_body text, p_as_support boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); request public.wooly_support_requests; existing public.wooly_support_messages; kind text;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  select * into request from public.wooly_support_requests where id = p_request_id for update;
  if not found then raise exception 'Request unavailable'; end if;
  if p_as_support then
    if not private.wooly_is_support() then raise exception 'Support access denied'; end if;
    kind := 'support';
  else
    if request.profile_id <> actor then raise exception 'Request access denied'; end if;
    kind := 'requester';
  end if;
  select * into existing from public.wooly_support_messages where id = p_id;
  if found then
    if existing.request_id <> p_request_id or existing.author_id <> actor or existing.author_kind <> kind or existing.body <> btrim(p_body) then raise exception 'Message identity conflict'; end if;
    return p_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 18));
  if (select count(*) from public.wooly_support_messages where author_id = actor and created_at > clock_timestamp() - interval '1 minute') >= 10 then
    raise exception 'Please wait before sending another reply';
  end if;
  insert into public.wooly_support_messages(id,request_id,author_id,author_kind,body) values(p_id,p_request_id,actor,kind,btrim(p_body));
  update public.wooly_support_requests set status = case when p_as_support then 'answered' else 'open' end,
    updated_at = clock_timestamp(),
    support_updated_at = case when p_as_support then clock_timestamp() else support_updated_at end
    where id = p_request_id;
  return p_id;
end;
$$;

create function public.set_wooly_support_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); request public.wooly_support_requests;
begin
  if actor is null or p_status not in ('open','closed') then raise exception 'Invalid status'; end if;
  select * into request from public.wooly_support_requests where id = p_id for update;
  if not found or not (private.wooly_is_support() or (request.profile_id = actor and p_status = 'closed')) then raise exception 'Request access denied'; end if;
  update public.wooly_support_requests set status = p_status, updated_at = clock_timestamp() where id = p_id;
end;
$$;
create function public.read_wooly_support_request(p_id uuid, p_read_until timestamptz) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.wooly_support_requests set requester_read_at = greatest(requester_read_at,least(p_read_until,clock_timestamp())) where id = p_id and profile_id = auth.uid();
  if not found then raise exception 'Request access denied'; end if;
end;
$$;

create function public.save_wooly_help_article(p_id uuid, p_title text, p_keywords text, p_answer text, p_audience text, p_route text, p_published boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.wooly_is_support() then raise exception 'Support access denied'; end if;
  insert into public.wooly_help_articles(id,title,keywords,answer,audience,route,published,created_by)
    values(p_id,btrim(p_title),btrim(p_keywords),btrim(p_answer),p_audience,p_route,p_published,auth.uid())
    on conflict(id) do update set title=excluded.title, keywords=excluded.keywords, answer=excluded.answer,
      audience=excluded.audience, route=excluded.route, published=excluded.published, updated_at=clock_timestamp();
  return p_id;
end;
$$;

revoke all on function public.create_wooly_support_request(uuid,text,text,text,uuid), public.reply_wooly_support(uuid,uuid,text,boolean), public.set_wooly_support_status(uuid,text), public.read_wooly_support_request(uuid,timestamptz), public.save_wooly_help_article(uuid,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.create_wooly_support_request(uuid,text,text,text,uuid), public.reply_wooly_support(uuid,uuid,text,boolean), public.set_wooly_support_status(uuid,text), public.read_wooly_support_request(uuid,timestamptz), public.save_wooly_help_article(uuid,text,text,text,text,text,boolean) to authenticated;
commit;
