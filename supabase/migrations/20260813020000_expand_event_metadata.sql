-- Expand: Timeline events own their specific service label. The column remains
-- nullable because rehearsals, meetings, and special events do not need it.
alter table public.events
  add column if not exists service_type text;

comment on column public.events.service_type is
  'Specific service label (for example Sunday Worship) for service-based events.';
