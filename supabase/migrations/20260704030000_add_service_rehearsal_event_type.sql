alter type public.event_type add value if not exists 'service_rehearsal';
alter table public.events add column if not exists rehearsal_end_time time;
