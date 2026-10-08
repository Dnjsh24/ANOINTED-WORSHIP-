-- Compact analytics uses the caller's existing table policies. No privileged
-- table reads, new policies, or stored analytics copy are introduced.
create function public.get_team_analytics(p_team_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.has_team_role(p_team_id,array['owner','admin']::public.team_role[]) then
    raise exception 'Team analytics require an active owner or admin' using errcode='42501';
  end if;
  with song_counts as (
    select ss.song_id,s.title,count(*) as count
    from public.setlist_songs ss
    join public.setlists sl on sl.id=ss.setlist_id and sl.team_id=p_team_id
    join public.songs s on s.id=ss.song_id and s.team_id=p_team_id
    where s.title<>''
    group by ss.song_id,s.title
    order by count desc,ss.song_id limit 10
  ), attendance_counts as (
    select e.type,count(a.id) as total,count(a.id) filter(where a.status='available') as confirmed
    from public.events e left join public.attendance a on a.event_id=e.id
    where e.team_id=p_team_id group by e.type
  ), channel_counts as (
    select c.id,c.name,count(*) as count
    from public.messages m join public.message_channels c on c.id=m.channel_id and c.team_id=p_team_id
    where m.created_at>=now()-interval '30 days' and c.name<>''
    group by c.id,c.name order by count desc,c.id limit 5
  )
  select jsonb_build_object(
    'mostPlayedSongs',coalesce((select jsonb_agg(jsonb_build_object('title',title,'count',count) order by count desc,song_id) from song_counts),'[]'::jsonb),
    'attendanceStats',coalesce((select jsonb_agg(jsonb_build_object('type',type,'rate',case when total=0 then 0 else confirmed*100.0/total end) order by type) from attendance_counts),'[]'::jsonb),
    'mostActiveChannels',coalesce((select jsonb_agg(jsonb_build_object('name',name,'count',count) order by count desc,id) from channel_counts),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_team_analytics(uuid) from public,anon;
grant execute on function public.get_team_analytics(uuid) to authenticated;
