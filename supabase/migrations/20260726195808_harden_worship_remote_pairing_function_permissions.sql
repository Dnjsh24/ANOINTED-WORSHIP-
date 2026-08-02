-- The pairing claim must only be callable by a signed-in user.  PostgreSQL
-- grants new functions EXECUTE to PUBLIC by default, so make each grant here
-- explicit rather than relying on the function body as the only guard.

revoke all on function public.claim_worship_remote_pairing(uuid, text) from public;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from anon;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from authenticated;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to authenticated;

-- This helper exists solely for RLS and the pairing function. It is not an
-- application RPC and must not be exposed to browser clients.
revoke all on function public.is_worship_remote_operator(uuid) from public;
revoke all on function public.is_worship_remote_operator(uuid) from anon;
revoke all on function public.is_worship_remote_operator(uuid) from authenticated;;
