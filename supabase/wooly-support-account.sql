-- OPTIONAL: give your own verified account access to /support/wooly.
-- Run AFTER wooly-sql-editor-setup.sql succeeds.
-- Supabase > Authentication > Users: copy your own user's UID.
-- Replace PASTE_YOUR_AUTH_USER_UID_HERE below. Do not use an email/password/API key.
-- No other account is granted and no team-owner role is used for authorization.
begin;

do $wooly_support_grant$
declare
  chosen_uid text := 'PASTE_YOUR_AUTH_USER_UID_HERE';
  support_profile uuid;
begin
  if chosen_uid = 'PASTE_YOUR_AUTH_USER_UID_HERE' then
    raise exception 'Replace PASTE_YOUR_AUTH_USER_UID_HERE with your verified Authentication user UID first.';
  end if;
  support_profile := chosen_uid::uuid;
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = support_profile
  ) then
    raise exception 'No matching website profile and Authentication user. Sign in to Sunday Setlist first and check the UID.';
  end if;
  insert into public.wooly_support_accounts (profile_id)
    values (support_profile) on conflict (profile_id) do nothing;
end;
$wooly_support_grant$;

commit;
select 'Support access granted to the chosen account. Sign in as that account and open /support/wooly.' as result;
