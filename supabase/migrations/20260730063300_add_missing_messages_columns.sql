-- Add missing columns for scheduled messages and threads to the messages table
alter table public.messages 
  add column if not exists scheduled_for timestamptz,
  add column if not exists is_delivered boolean not null default true,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null;

-- Index for scheduled messages to make querying them faster
create index if not exists idx_messages_scheduled_for on public.messages(scheduled_for) where scheduled_for is not null;
