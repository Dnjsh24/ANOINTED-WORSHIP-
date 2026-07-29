-- The pairing claim must only be callable by a signed-in user.  PostgreSQL
-- grants new functions EXECUTE to PUBLIC by default, so make each grant here
-- explicit rather than relying on the function body as the only guard.

revoke all on function public.claim_worship_remote_pairing(uuid, text) from public;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from anon;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from authenticated;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to authenticated;

-- The helper lives in the private schema. Authenticated callers need its
-- EXECUTE privilege for pairing-session RLS evaluation, but it is not a
-- public PostgREST RPC.
revoke all on function private.is_worship_remote_operator(uuid) from public;
revoke all on function private.is_worship_remote_operator(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_worship_remote_operator(uuid) to authenticated;
