-- Security-invoker sync RPCs must be able to see only their own team's
-- changes and idempotency receipts while still obeying row-level security.
drop policy if exists "Active members can read worship sync changes" on public.worship_sync_changes;
create policy "Active members can read worship sync changes"
on public.worship_sync_changes for select to authenticated
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = worship_sync_changes.team_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
);

drop policy if exists "Active members can read worship sync receipts" on public.worship_sync_receipts;
create policy "Active members can read worship sync receipts"
on public.worship_sync_receipts for select to authenticated
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = worship_sync_receipts.team_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
);

drop policy if exists "Active members can create worship sync receipts" on public.worship_sync_receipts;
create policy "Active members can create worship sync receipts"
on public.worship_sync_receipts for insert to authenticated
with check (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = worship_sync_receipts.team_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
);
