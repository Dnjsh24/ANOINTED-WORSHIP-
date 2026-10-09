-- Search, favorite filtering and popularity ordering precede pagination.
create function public.search_songs(p_team_id uuid,p_query text,p_favorites boolean default false,p_sort text default 'title')
returns setof public.songs language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 or p_sort not in ('title','playCount') then
    raise exception 'Invalid song search' using errcode='22023';
  end if;
  return query select s.* from public.songs s
    where s.team_id=p_team_id and s.deleted_at is null and s.status='approved'
      and (v_query='' or position(v_query in lower(s.title))>0 or position(v_query in lower(s.artist))>0
        or exists(select 1 from unnest(s.tags) tag where position(v_query in lower(tag))>0))
      and (not p_favorites or exists(select 1 from public.song_favorites f join public.team_members tm on tm.id=f.team_member_id
        where f.song_id=s.id and tm.team_id=p_team_id and tm.profile_id=auth.uid() and tm.status='active'))
    order by case when p_sort='playCount' then
      (select count(*) from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
        where ss.song_id=s.id and ss.deleted_at is null and sl.team_id=p_team_id and sl.deleted_at is null) end desc,
      s.title,s.id;
end;
$$;
revoke all on function public.search_songs(uuid,text,boolean,text) from public,anon;
grant execute on function public.search_songs(uuid,text,boolean,text) to authenticated;
