-- Filter before PostgREST count/order/range. Never truncate matching song IDs.
create function public.search_setlists(p_team_id uuid,p_query text)
returns setof public.setlists language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 then raise exception 'Search is too long' using errcode='22023'; end if;
  return query select s.* from public.setlists s
    where s.team_id=p_team_id and s.deleted_at is null and (
      v_query='' or position(v_query in lower(s.name))>0
      or position(v_query in lower(coalesce(s.location,'')))>0
      or position(v_query in s.setlist_date::text)>0
      or position(v_query in lower(coalesce(s.service_times::text,'')))>0
      or exists(select 1 from public.team_members tm join public.profiles p on p.id=tm.profile_id
        where tm.id=s.leader_member_id and tm.team_id=p_team_id and position(v_query in lower(coalesce(p.full_name,'')))>0)
      or exists(select 1 from public.setlist_songs ss join public.songs song on song.id=ss.song_id
        where ss.setlist_id=s.id and ss.deleted_at is null and song.team_id=p_team_id
          and song.deleted_at is null and position(v_query in lower(song.title))>0));
end;
$$;
revoke all on function public.search_setlists(uuid,text) from public,anon;
grant execute on function public.search_setlists(uuid,text) to authenticated;
