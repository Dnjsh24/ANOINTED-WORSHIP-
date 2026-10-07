-- Actor-derived outstanding saved checks, before caller count/order/range.
create function public.get_personal_preparation(p_team_id uuid)
returns table(setlist_id uuid,task_key text,setlist_name text,setlist_date date)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  return query select p.setlist_id,task->>'key',s.name,s.setlist_date
    from public.rehearsal_plans p join public.setlists s on s.id=p.setlist_id and s.team_id=p_team_id
    cross join lateral jsonb_array_elements(p.tasks) task
    join public.team_members tm on tm.id=(task->>'assignee_member_id')::uuid and tm.team_id=p_team_id
      and tm.profile_id=auth.uid() and tm.status='active'
    left join public.rehearsal_task_responses r on r.setlist_id=p.setlist_id and r.task_key=task->>'key' and r.team_member_id=tm.id
    where p.team_id=p_team_id and s.deleted_at is null and s.setlist_date>=current_date and not coalesce(r.completed,false);
end;
$$;
revoke all on function public.get_personal_preparation(uuid) from public,anon;
grant execute on function public.get_personal_preparation(uuid) to authenticated;
