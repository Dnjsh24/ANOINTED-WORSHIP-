-- Private drafts must not become readable through current or historical sync.
create function private.sync_snapshot_visible(p_team uuid,p_type text,p_id uuid,p_operation text,p_payload jsonb)
returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and private.is_approved_member(p_team) and case p_type
  when 'event' then
    (private.has_team_role(p_team,array['owner','admin']::public.team_role[]) or p_payload->>'created_by'=auth.uid()::text
      or (p_payload->>'approval_status'='approved' and (p_operation='delete' or exists(select 1 from public.events e where e.id=p_id and e.team_id=p_team and e.approval_status='approved'))))
  when 'song' then p_payload->>'status'='approved' and
    (p_operation='delete' or exists(select 1 from public.songs s where s.id=p_id and s.team_id=p_team and s.status='approved'))
  when 'setlist' then p_operation='delete' or exists(select 1 from public.setlists s where s.id=p_id and s.team_id=p_team)
  when 'setlist_song' then p_operation='delete' or exists(select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id where ss.id=p_id and s.team_id=p_team)
  else false end;
$$;
revoke all on function private.sync_snapshot_visible(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function private.sync_snapshot_visible(uuid,text,uuid,text,jsonb) to authenticated;
drop policy if exists "Active members can read worship sync changes" on public.worship_sync_changes;
create policy "Visible snapshots only" on public.worship_sync_changes for select to authenticated
using(private.sync_snapshot_visible(team_id,entity_type,entity_id,operation,payload));
-- New sync writes come from the guarded row triggers, never client snapshots.
revoke insert,update,delete on public.worship_sync_changes from authenticated,anon;
-- Tombstones carry identity and visibility metadata, never deleted draft text.
update public.worship_sync_changes set payload=jsonb_build_object('id',entity_id,'team_id',team_id,'sync_revision',revision,
  'deleted_at',payload->'deleted_at','approval_status',payload->'approval_status','status',payload->'status',
  'created_by',payload->'created_by','setlist_id',payload->'setlist_id') where operation='delete';
