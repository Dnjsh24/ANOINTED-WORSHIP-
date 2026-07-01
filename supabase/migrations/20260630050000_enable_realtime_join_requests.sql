-- Enable real-time updates for join_requests table so the team management page
-- can automatically receive new requests, and waiting members can detect when
-- their request has been approved or rejected.

alter publication supabase_realtime add table public.join_requests;
