\set ON_ERROR_STOP on

begin;

insert into public.teams (id, name, code, owner_id)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'Second Test Team',
  'QA-20002',
  '33333333-3333-3333-3333-333333333333'
);

insert into public.team_members (team_id, profile_id, role, status)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '33333333-3333-3333-3333-333333333333',
  'owner',
  'active'
);

insert into public.setlist_templates (team_id, name, created_by)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Team A template',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'Team B template',
    '33333333-3333-3333-3333-333333333333'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);

do $$
declare
  visible_count integer;
  notification_count integer;
  second_team_member_id uuid;
  denied boolean := false;
  unsafe_policy_count integer;
  multiple_policy_group_count integer;
  missing_index_count integer;
  secure_pairing_function_count integer;
  unsafe_pairing_function_count integer;
begin
  select count(*) into visible_count from public.setlist_templates;
  if visible_count <> 1 then
    raise exception 'owner should see exactly one team template, saw %', visible_count;
  end if;

  if not private.can_write_presentation_media(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/slide.png'
  ) then
    raise exception 'active member should be allowed to write their own team/user media path';
  end if;

  if private.can_write_presentation_media(
    'ffffffff-ffff-ffff-ffff-ffffffffffff/11111111-1111-1111-1111-111111111111/slide.png'
  ) then
    raise exception 'member must not write media into another team path';
  end if;

  if private.can_write_presentation_media(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/22222222-2222-2222-2222-222222222222/slide.png'
  ) then
    raise exception 'member must not write media into another user path';
  end if;

  begin
    insert into public.setlist_templates (team_id, name, created_by)
    values (
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'Cross-team insert must fail',
      '11111111-1111-1111-1111-111111111111'
    );
  exception
    when insufficient_privilege then denied := true;
  end;

  if not denied then
    raise exception 'cross-team setlist template insert was not denied';
  end if;

  insert into public.feedback_reports (
    team_id,
    profile_id,
    report_type,
    title
  )
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'bug',
    'Own-profile feedback is allowed'
  );

  denied := false;
  begin
    insert into public.feedback_reports (
      team_id,
      profile_id,
      report_type,
      title
    )
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '33333333-3333-3333-3333-333333333333',
      'bug',
      'Spoofed feedback author must fail'
    );
  exception
    when insufficient_privilege then denied := true;
  end;

  if not denied then
    raise exception 'feedback author profile spoofing was not denied';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222',
    true
  );

  insert into public.attendance (event_id, team_member_id, status, responded_at)
  values (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'available',
    now()
  );

  perform set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    true
  );

  select count(*)
  into notification_count
  from public.notifications
  where team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and profile_id = '11111111-1111-1111-1111-111111111111'
    and created_by = '22222222-2222-2222-2222-222222222222'
    and event_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    and title = 'Attendance Updated';

  if notification_count <> 1 then
    raise exception 'attendance response should create exactly one leader notification, saw %', notification_count;
  end if;

  select id
  into second_team_member_id
  from public.team_members
  where team_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    and profile_id = '33333333-3333-3333-3333-333333333333';

  perform set_config(
    'request.jwt.claim.sub',
    '33333333-3333-3333-3333-333333333333',
    true
  );

  denied := false;
  begin
    insert into public.attendance (event_id, team_member_id, status, responded_at)
    values (
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      second_team_member_id,
      'maybe',
      now()
    );
  exception
    when insufficient_privilege or check_violation then denied := true;
  end;

  if not denied then
    raise exception 'cross-team attendance member/event pairing was not denied';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    true
  );

  select count(*)
  into unsafe_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename not in (
      'presentation_assets',
      'worship_sync_changes',
      'worship_sync_receipts'
    )
    and (
      replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%'
      or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%'
    );

  if unsafe_policy_count <> 0 then
    raise exception '% website policies still evaluate auth.uid() per row', unsafe_policy_count;
  end if;

  select count(*)
  into multiple_policy_group_count
  from (
    select tablename, cmd
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and 'authenticated' = any(roles)
      and tablename not in (
        'presentation_assets',
        'worship_sync_changes',
        'worship_sync_receipts'
      )
    group by tablename, cmd
    having count(*) > 1
  ) policy_groups;

  if multiple_policy_group_count <> 0 then
    raise exception '% website table/actions still have multiple permissive authenticated policies', multiple_policy_group_count;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'Users can view their team custom roles',
        'Team members can view custom roles',
        'Admins can manage custom roles',
        'members can insert feedback reports',
        'team members can insert feedback',
        'owners and admins can view feedback reports',
        'owner/admin can view feedback',
        'Users can manage their own push subscriptions',
        'System can insert changelog',
        'Team members can view changelog',
        'Team members view changelog',
        'Leaders can delete team songs'
      )
  ) then
    raise exception 'a superseded website RLS policy still exists';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and policyname = 'Song managers can delete team songs'
      and roles = array['authenticated']::name[]
      and cmd = 'DELETE'
  ) then
    raise exception 'the owner/admin song deletion policy is missing or mis-scoped';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_worship_remote_operator'
      and array_to_string(p.proconfig, ',') like '%search_path=""%'
  ) then
    raise exception 'private.is_worship_remote_operator does not pin an empty search_path';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.notify_attendance_response()',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute the attendance notification trigger function';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.validate_attendance_team()',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute the attendance team validation trigger function';
  end if;

  select count(*)
  into missing_index_count
  from unnest(array[
    'public.activity_logs_profile_id_idx',
    'public.activity_logs_team_id_idx',
    'public.announcements_event_id_idx',
    'public.announcements_target_profile_id_idx',
    'public.channel_reads_channel_id_idx',
    'public.custom_roles_team_id_idx',
    'public.feedback_reports_profile_id_idx',
    'public.message_reads_profile_id_idx',
    'public.notifications_created_by_idx',
    'public.notifications_event_id_idx',
    'public.notifications_target_profile_id_idx',
    'public.push_subscriptions_profile_id_idx',
    'public.service_templates_created_by_idx',
    'public.setlist_change_log_changed_by_idx',
    'public.setlist_templates_created_by_idx',
    'public.setlist_templates_team_id_idx',
    'public.team_invitations_invited_by_idx',
    'public.team_members_custom_role_id_idx',
    'public.user_annotations_profile_id_idx',
    'public.user_push_tokens_user_id_idx',
    'public.worship_remote_pairing_sessions_created_by_idx',
    'public.worship_remote_pairing_sessions_paired_by_idx',
    'public.worship_remote_pairing_sessions_setlist_id_idx',
    'public.worship_remote_pairing_sessions_team_id_idx'
  ]) as expected(index_name)
  where to_regclass(expected.index_name) is null;

  if missing_index_count <> 0 then
    raise exception '% website foreign-key indexes are missing', missing_index_count;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.deliver_scheduled_messages(integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute service-role scheduled delivery RPC';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.deliver_scheduled_messages(integer)',
    'EXECUTE'
  ) then
    raise exception 'service role cannot execute scheduled delivery RPC';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_worship_remote_pairing(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role can execute the remote pairing claim RPC';
  end if;

  select
    count(*),
    count(*) filter (
      where array_to_string(coalesce(p.proconfig, array[]::text[]), ',')
        not like '%search_path=""%'
    )
  into secure_pairing_function_count, unsafe_pairing_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_worship_remote_pairing',
      'claim_worship_remote_pairing',
      'claim_worship_remote_pairing_by_pin',
      'resume_worship_remote_pairing',
      'revoke_worship_remote_pairing'
    );

  if secure_pairing_function_count <> 5 or unsafe_pairing_function_count <> 0 then
    raise exception 'secure Worship Remote RPCs are missing or do not pin an empty search_path';
  end if;

  if has_function_privilege('anon', 'public.create_worship_remote_pairing(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_worship_remote_pairing_by_pin(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.resume_worship_remote_pairing(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.revoke_worship_remote_pairing(uuid)', 'EXECUTE')
  then
    raise exception 'anonymous role can execute a secure Worship Remote RPC';
  end if;

  if not has_function_privilege('authenticated', 'public.create_worship_remote_pairing(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.claim_worship_remote_pairing_by_pin(text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.resume_worship_remote_pairing(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.revoke_worship_remote_pairing(uuid)', 'EXECUTE')
  then
    raise exception 'authenticated role cannot execute a secure Worship Remote RPC';
  end if;

  if has_table_privilege(
    'authenticated',
    'private.worship_remote_pairing_attempts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'anon',
    'private.worship_remote_pairing_attempts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'a client role has direct access to the private PIN-attempt table';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'Worship remote operators can receive private broadcasts'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'Worship remote operators can send private broadcasts'
      and roles = array['authenticated']::name[]
      and cmd = 'INSERT'
  ) then
    raise exception 'private Worship Remote Realtime policies are missing or mis-scoped';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'Worship remote operators can receive private broadcasts',
        'Worship remote operators can send private broadcasts'
      )
      and position(
        'private = true' in coalesce(qual, with_check, '')
      ) > 0
  ) then
    raise exception 'Worship Remote policies depend on a private flag absent from Realtime authorization probes';
  end if;
end
$$;

rollback;

\echo website_security_regression: PASS
