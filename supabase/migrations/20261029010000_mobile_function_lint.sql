-- Forward-only lint repair. Preserve function OIDs, signatures, grants and guards.
-- Explicitly type defaults; keep validation casts when removing write-only locals.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $repair$
declare r record; definition text; repaired text; seen integer:=0;
begin
 for r in select p.oid, jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'grants',p.proacl,'settings',p.proconfig,'argumentNames',p.proargnames) as properties,n.nspname||'.'||p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname||'.'||p.proname in ('private.mobile_can_read_record','private.apply_mobile_workflow_command','private.prepare_mobile_event_form','private.apply_mobile_event_command','private.apply_mobile_service_command','private.apply_mobile_rehearsal_command_core','private.check_setlist_aggregate_intent','private.validate_mobile_setlist_command','private.validate_mobile_rehearsal_command_core','private.validate_mobile_announcement_fields','public.mobile_apply_reminder_edit','public.mobile_apply_command','public.mobile_download_asset_page','public.mobile_apply_workflow_commands','public.mobile_apply_event_commands','public.mobile_apply_service_commands','public.mobile_apply_setlist_commands','public.mobile_apply_template_commands','public.mobile_apply_rehearsal_commands','public.stage_live_cursor','public.mobile_download_page','public.mobile_read_reminder_management','public.mobile_apply_member_request_batch','public.mobile_apply_custom_role_retirement') loop
  seen:=seen+1; definition:=pg_get_functiondef(r.oid); repaired:=definition;
  repaired:=regexp_replace(repaired, '(jsonb\s*(?::=|default)\s*)(''(?:[^'']|'''')*'')(?!\s*::)', '\1\2::jsonb', 'gi');
  repaired:=regexp_replace(repaired, '(uuid\[\]\s*(?::=|default)\s*)(''(?:[^'']|'''')*'')(?!\s*::)', '\1\2::uuid[]', 'gi');
  case r.name
   when 'private.mobile_can_read_record' then repaired:=regexp_replace(repaired,'\mSTABLE\M','VOLATILE','g');
   when 'private.apply_mobile_workflow_command' then repaired:=replace(repaired,'v_status text;','');
   when 'private.prepare_mobile_event_form' then
    repaired:=replace(repaired,'v_date date;','');
    repaired:=regexp_replace(repaired,'\mv_date\s*:=\s*([^;]+);','perform \1;','g');
   when 'private.apply_mobile_rehearsal_command_core' then repaired:=replace(repaired,'v_plan public.rehearsal_plans%rowtype;','');
   when 'private.check_setlist_aggregate_intent' then
    -- Keep the historical public-wrapper argument and its existing event validation.
    repaired:=regexp_replace(repaired,'\mbegin\M','begin perform p_event;','i');
   when 'private.validate_mobile_setlist_command' then
    repaired:=regexp_replace(repaired,'\mv_sources uuid\[\]\s*:=\s*''\{\}''(?:::uuid\[\])?;','','g');
    repaired:=replace(repaired,'v_count integer;','');
   when 'private.validate_mobile_rehearsal_command_core' then
    repaired:=replace(repaired,'v_id uuid;','');
    repaired:=regexp_replace(repaired,'\mv_id\s*:=\s*([^;]+);','perform \1;','g');
   when 'private.validate_mobile_announcement_fields' then
    repaired:=replace(repaired,'v_time timestamptz;','');
    repaired:=regexp_replace(repaired,'\mv_time\s*:=\s*([^;]+);','perform \1;','g');
   when 'public.mobile_apply_reminder_edit' then repaired:=replace(repaired,'v_index integer;','');
   when 'public.stage_live_cursor' then
    repaired:=replace(repaired,'v_event public.events%rowtype;','');
    repaired:=replace(repaired,'select * into v_event from public.events','perform 1 from public.events');
    repaired:=replace(repaired,'v_id uuid;','');
    repaired:=regexp_replace(repaired,'\mv_id\s*:=\s*([^;]+);','perform \1;','g');
   when 'public.mobile_apply_custom_role_retirement' then
    repaired:=replace(repaired,'v_custom_id uuid;','');
    repaired:=replace(repaired,'v_member_before jsonb;','');
   else null;
  end case;
  if repaired=definition then raise exception 'Expected lint repair did not match %',r.name; end if;
  execute repaired;
  if (select jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'grants',p.proacl,'settings',p.proconfig,'argumentNames',p.proargnames) from pg_proc p where p.oid=r.oid) is distinct from r.properties then
   raise exception 'Function identity or security properties changed for %',r.name;
  end if;
 end loop;
 if seen<>24 then raise exception 'Expected24 linted functions, found %',seen; end if;
end $repair$;
commit;
