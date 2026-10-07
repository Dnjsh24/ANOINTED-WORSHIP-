-- Cast enum values explicitly; PostgREST ILIKE cannot search an enum column.
create function public.search_events(p_team_id uuid,p_query text)
returns setof public.events language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 then raise exception 'Search is too long' using errcode='22023'; end if;
  return query select e.* from public.events e where e.team_id=p_team_id and e.deleted_at is null
    and (v_query='' or position(v_query in lower(e.name))>0 or position(v_query in lower(coalesce(e.location,'')))>0
      or position(v_query in lower(e.type::text))>0 or position(v_query in e.event_date::text)>0);
end;
$$;
revoke all on function public.search_events(uuid,text) from public,anon;
grant execute on function public.search_events(uuid,text) to authenticated;
