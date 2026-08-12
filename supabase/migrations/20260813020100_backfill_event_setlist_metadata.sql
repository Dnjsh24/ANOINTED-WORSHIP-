-- Data migration: choose one linked setlist per event before the uniqueness
-- constraint is introduced. The most recently edited setlist remains linked.
with ranked_links as (
  select
    id,
    row_number() over (
      partition by event_id
      order by updated_at desc, id desc
    ) as link_rank
  from public.setlists
  where event_id is not null
)
update public.setlists as setlist
set event_id = null
from ranked_links
where setlist.id = ranked_links.id
  and ranked_links.link_rank > 1;

-- Backfill the event-owned specific service label from the retained setlist.
update public.events as event
set service_type = coalesce(
  nullif(trim(event.service_type), ''),
  nullif(trim(setlist.service_times[1]), ''),
  'Sunday Worship'
)
from public.setlists as setlist
where setlist.event_id = event.id
  and event.type in ('service', 'service_rehearsal');

update public.events
set service_type = 'Sunday Worship'
where type in ('service', 'service_rehearsal')
  and nullif(trim(service_type), '') is null;

-- Linked legacy columns remain populated for desktop/backward compatibility.
update public.setlists as setlist
set
  setlist_date = event.event_date,
  location = event.location,
  call_time = coalesce(event.call_time, event.starts_at),
  rehearsal_time = event.rehearsal_time,
  service_times = case
    when event.type in ('service', 'service_rehearsal') and event.service_type is not null
      then array[event.service_type]
    else array[]::text[]
  end
from public.events as event
where setlist.event_id = event.id;

-- Standalone setlists keep their required compatibility date but no longer
-- retain or expose event-only metadata.
update public.setlists
set
  location = null,
  call_time = null,
  rehearsal_time = null,
  service_times = array[]::text[],
  leader_member_id = null
where event_id is null;
