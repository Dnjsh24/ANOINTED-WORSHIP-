-- Atomic ministry defaults only. Existing missing settings rows are not created.
begin;
create table private.mobile_team_settings_edit_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_team_settings_edit_receipts enable row level security;
revoke all on private.mobile_team_settings_edit_receipts from public,anon,authenticated;
create trigger mobile_team_settings_edit_receipt_immutable before update or delete on private.mobile_team_settings_edit_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.mobile_team_settings_snapshot(p_team uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('teamId',t.id,'teamName',t.name,'settings',case when s.team_id is null then null else jsonb_build_object(
  'defaultServiceLocation',s.default_service_location,'defaultCallTime',s.default_call_time::text,'defaultRehearsalTime',s.default_rehearsal_time::text,
  'notificationPreferences',s.notification_preferences,'dashboardWidgets',s.dashboard_widgets,'updatedAt',s.updated_at) end)
 from public.teams t left join public.team_settings s on s.team_id=t.id where t.id=p_team;
$$;
revoke all on function private.mobile_team_settings_snapshot(uuid) from public,anon,authenticated;
create function public.mobile_apply_team_settings_edit(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_base jsonb;v_base_settings jsonb;v_value jsonb;v_team public.teams%rowtype;v_settings public.team_settings%rowtype;
 v_actor_member public.team_members%rowtype;v_saved private.mobile_team_settings_edit_receipts%rowtype;v_status text;v_current jsonb;v_result jsonb;v_recorded timestamptz;v_preferences text[];
 v_known text[]:=array['pendingRequests','upcomingEvents','unreadMessages','attendanceReminders'];v_unknown_base jsonb;v_unknown_value jsonb;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected defaults manager required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid defaults edit' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid defaults identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Defaults scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_value:=p_request->'value';v_keys:=array['teamName','settings'];
 if jsonb_typeof(v_base)<>'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or jsonb_typeof(v_base->'teamName')<>'string' or length(v_base->>'teamName') not between 2 and 80 or jsonb_typeof(v_base->'settings') not in ('null','object') then raise exception 'Invalid downloaded settings base' using errcode='22023';end if;
 v_base_settings:=v_base->'settings';
 if v_base_settings<>'null'::jsonb then
  v_keys:=array['defaultServiceLocation','defaultCallTime','defaultRehearsalTime','notificationPreferences','dashboardWidgets','updatedAt'];
  if not v_base_settings ?& v_keys or v_base_settings-v_keys<>'{}'::jsonb or jsonb_typeof(v_base_settings->'defaultServiceLocation')<>'string' or length(v_base_settings->>'defaultServiceLocation')>160
   or jsonb_typeof(v_base_settings->'updatedAt')<>'string' or jsonb_typeof(v_base_settings->'notificationPreferences')<>'array' or jsonb_typeof(v_base_settings->'dashboardWidgets')<>'array' then raise exception 'Invalid persisted settings base' using errcode='22023';end if;
  perform (v_base_settings->>'updatedAt')::timestamptz;
 end if;
 v_keys:=array['teamName','defaultServiceLocation','defaultCallTime','defaultRehearsalTime','notificationPreferences'];
 if jsonb_typeof(v_value)<>'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb or jsonb_typeof(v_value->'teamName')<>'string' or length(v_value->>'teamName') not between 2 and 80 or v_value->>'teamName'<>btrim(v_value->>'teamName')
  or jsonb_typeof(v_value->'defaultServiceLocation')<>'string' or length(v_value->>'defaultServiceLocation') not between 1 and 160 or v_value->>'defaultServiceLocation'<>btrim(v_value->>'defaultServiceLocation') or jsonb_typeof(v_value->'notificationPreferences')<>'array' then raise exception 'Invalid defaults values' using errcode='22023';end if;
 foreach v_key in array array['defaultCallTime','defaultRehearsalTime'] loop
  if jsonb_typeof(v_value->v_key)<>'string' or v_value->>v_key!~'^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$' then raise exception 'Invalid defaults time' using errcode='22023';end if;
  if v_base_settings<>'null'::jsonb and (jsonb_typeof(v_base_settings->v_key)<>'string' or v_base_settings->>v_key!~'^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$') then raise exception 'Invalid downloaded time' using errcode='22023';end if;
 end loop;
 if jsonb_array_length(v_value->'notificationPreferences')>100 or exists(select 1 from jsonb_array_elements(v_value->'notificationPreferences') p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>160) then raise exception 'Invalid preference list' using errcode='22023';end if;
 if v_base_settings<>'null'::jsonb and (jsonb_array_length(v_base_settings->'notificationPreferences')>100 or jsonb_array_length(v_base_settings->'dashboardWidgets')>100
  or exists(select 1 from jsonb_array_elements((v_base_settings->'notificationPreferences')||(v_base_settings->'dashboardWidgets')) p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>160)) then raise exception 'Invalid saved preference or dashboard list' using errcode='22023';end if;
 select coalesce(jsonb_agg(p order by n),'[]') into v_unknown_value from jsonb_array_elements(v_value->'notificationPreferences') with ordinality a(p,n) where not (p#>>'{}')=any(v_known);
 select coalesce(jsonb_agg(p order by n),'[]') into v_unknown_base from jsonb_array_elements(coalesce(nullif(v_base_settings,'null')->'notificationPreferences','[]')) with ordinality a(p,n) where not (p#>>'{}')=any(v_known);
 if v_unknown_base is distinct from v_unknown_value then raise exception 'Unknown saved preferences must remain unchanged' using errcode='22023';end if;
 select coalesce(array_agg(p order by n),'{}') into v_preferences from jsonb_array_elements_text(v_value->'notificationPreferences') with ordinality a(p,n);
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('team-settings-edit:'||v_actor::text,0));
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found then raise exception 'Current own defaults membership required' using errcode='42501';end if;
 if v_actor_member.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor_member.custom_role_id and team_id=p_team_id for share;end if;
 if not coalesce(private.has_team_permission(p_team_id,'team.manage'),false) then raise exception 'Current team-management authority required' using errcode='42501';end if;
 select * into v_saved from private.mobile_team_settings_edit_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Defaults nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_team from public.teams where id=p_team_id for update;
 if not found then raise exception 'Selected ministry unavailable' using errcode='42501';end if;
 select * into v_settings from public.team_settings where team_id=p_team_id for update;
 if not found then v_status:='missing';
 elsif v_base_settings='null'::jsonb or v_team.name is distinct from v_base->>'teamName' or v_settings.default_service_location is distinct from v_base_settings->>'defaultServiceLocation'
  or v_settings.default_call_time is distinct from (v_base_settings->>'defaultCallTime')::time or v_settings.default_rehearsal_time is distinct from (v_base_settings->>'defaultRehearsalTime')::time
  or v_settings.notification_preferences is distinct from array(select jsonb_array_elements_text(v_base_settings->'notificationPreferences')) or v_settings.dashboard_widgets is distinct from array(select jsonb_array_elements_text(v_base_settings->'dashboardWidgets'))
  or v_settings.updated_at is distinct from (v_base_settings->>'updatedAt')::timestamptz then v_status:='conflict';
 else
  if v_team.name is distinct from v_value->>'teamName' then update public.teams set name=v_value->>'teamName' where id=p_team_id;end if;
  if v_settings.default_service_location is distinct from v_value->>'defaultServiceLocation' or v_settings.default_call_time is distinct from (v_value->>'defaultCallTime')::time
   or v_settings.default_rehearsal_time is distinct from (v_value->>'defaultRehearsalTime')::time or v_settings.notification_preferences is distinct from v_preferences then
   update public.team_settings set default_service_location=v_value->>'defaultServiceLocation',default_call_time=(v_value->>'defaultCallTime')::time,default_rehearsal_time=(v_value->>'defaultRehearsalTime')::time,notification_preferences=v_preferences where team_id=p_team_id;
  end if;
  v_status:='applied';
 end if;
 v_current:=private.mobile_team_settings_snapshot(p_team_id);v_recorded:=clock_timestamp();
 if v_status='applied' and (v_current->>'teamName' is distinct from v_value->>'teamName' or v_current#>>'{settings,defaultServiceLocation}' is distinct from v_value->>'defaultServiceLocation'
  or (v_current#>>'{settings,defaultCallTime}')::time is distinct from (v_value->>'defaultCallTime')::time or (v_current#>>'{settings,defaultRehearsalTime}')::time is distinct from (v_value->>'defaultRehearsalTime')::time
  or v_current#>'{settings,notificationPreferences}' is distinct from v_value->'notificationPreferences' or v_current#>'{settings,dashboardWidgets}' is distinct from v_base_settings->'dashboardWidgets') then raise exception 'Exact defaults persistence could not be confirmed' using errcode='22023';end if;
 v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_recorded);
 insert into private.mobile_team_settings_edit_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_team_settings_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_team_settings_edit(uuid,uuid,jsonb) to authenticated;
commit;
