-- Source-only durable whole-group reminder management. No hosted application authorized.
begin;
create table private.mobile_reminder_edit_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_reminder_edit_receipts enable row level security;
revoke all on private.mobile_reminder_edit_receipts from public,anon,authenticated;
create function private.guard_mobile_reminder_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Reminder mutation receipts are immutable' using errcode='42501';end;
$$;
revoke all on function private.guard_mobile_reminder_receipt() from public,anon,authenticated;
create trigger mobile_reminder_receipt_immutable before update or delete on private.mobile_reminder_edit_receipts for each row execute function private.guard_mobile_reminder_receipt();
create index notifications_team_notice_group_idx on public.notifications(team_id,notice_group_id,id);

create function private.require_mobile_reminder_manager(p_team uuid,p_member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_team is null or p_member is null then raise exception 'Selected manager required' using errcode='42501';end if;
 perform 1 from public.team_members where team_id=p_team order by id for share;
 if not exists(select 1 from public.team_members where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active' and role in ('owner','admin'))
  or not coalesce(private.has_team_permission(p_team,'members.manage'),false) then raise exception 'Current reminder manager required' using errcode='42501';end if;
end;
$$;
revoke all on function private.require_mobile_reminder_manager(uuid,uuid) from public,anon,authenticated;
create function private.mobile_reminder_key(n public.notifications) returns text language sql immutable set search_path='' as $$
 select case when n.notice_group_id is null then 'legacy:'||n.id::text else 'group:'||n.notice_group_id::text end;
$$;
create function private.mobile_reminder_matches(n public.notifications,p_team uuid,p_target jsonb) returns boolean language sql immutable set search_path='' as $$
 select n.team_id=p_team and case when p_target->>'kind'='group' then n.notice_group_id=(p_target->>'id')::uuid else n.notice_group_id is null and n.id=(p_target->>'id')::uuid end;
$$;
revoke all on function private.mobile_reminder_key(public.notifications),private.mobile_reminder_matches(public.notifications,uuid,jsonb) from public,anon,authenticated;

create function private.mobile_reminder_base(p_team uuid,p_target jsonb) returns jsonb language plpgsql stable set search_path='' set timezone='UTC' as $$
declare v_first public.notifications%rowtype;v_count bigint;v_people bigint;v_occurrences bigint;v_first_time timestamptz;v_last_time timestamptz;v_created timestamptz;v_hash text;
begin
 if p_target->>'kind'='legacy' and exists(select 1 from public.notifications where id=(p_target->>'id')::uuid and (team_id<>p_team or notice_group_id is not null or profile_id<>auth.uid())) then raise exception 'Legacy notification belongs to another recipient or scope' using errcode='42501';end if;
 if p_target->>'kind'='group' and exists(select 1 from public.notifications where notice_group_id=(p_target->>'id')::uuid and team_id<>p_team) then raise exception 'Reminder group crosses team boundaries' using errcode='42501';end if;
 select count(*),count(distinct profile_id),count(distinct recurrence_index),min(scheduled_for),max(scheduled_for),min(created_at)
  into v_count,v_people,v_occurrences,v_first_time,v_last_time,v_created from public.notifications n where n.team_id=p_team and private.mobile_reminder_matches(n,p_team,p_target);
 if v_count=0 then return null;end if;
 if v_count>60000 or v_people>5000 or v_occurrences>12 then raise exception 'Complete reminder group exceeds read limits' using errcode='22023';end if;
 select * into v_first from public.notifications n where n.team_id=p_team and private.mobile_reminder_matches(n,p_team,p_target) order by id limit 1;
 if exists(select 1 from public.notifications n where n.team_id=p_team and private.mobile_reminder_matches(n,p_team,p_target) and (
   octet_length(to_jsonb(n)::text)>16384 or length(n.title)>160 or length(n.body)>2000 or length(n.target_label)>254 or length(n.target_path)>200
   or n.recurrence_index<0 or n.recurrence_index>=n.recurrence_total or n.recurrence_total>1001
   or row(n.title,n.body,n.priority,n.event_id,n.target_path,n.target_role,n.target_profile_id,n.target_label,n.created_by,n.recurrence_rule,n.recurrence_total)
     is distinct from row(v_first.title,v_first.body,v_first.priority,v_first.event_id,v_first.target_path,v_first.target_role,v_first.target_profile_id,v_first.target_label,v_first.created_by,v_first.recurrence_rule,v_first.recurrence_total))) then
  raise exception 'Reminder group has inconsistent or unbounded metadata' using errcode='22023';end if;
 -- Hash each full current row first, then its ID-ordered digest list. Personal
 -- receipt changes are excluded; existing shared revisions still fence content ABA.
 select encode(sha256(convert_to(string_agg(encode(sha256(convert_to((to_jsonb(n)-array['read_at','acknowledged_at'])::text,'UTF8')),'hex'),'' order by n.id),'UTF8')),'hex')
  into v_hash from public.notifications n where n.team_id=p_team and private.mobile_reminder_matches(n,p_team,p_target);
 return p_target||jsonb_build_object('title',v_first.title,'body',v_first.body,'priority',v_first.priority,'eventId',v_first.event_id,'targetPath',v_first.target_path,
  'targetRole',v_first.target_role,'targetProfileId',v_first.target_profile_id,'targetLabel',v_first.target_label,'createdBy',v_first.created_by,'createdAt',v_created,
  'firstScheduledFor',v_first_time,'lastScheduledFor',v_last_time,'recurrenceRule',v_first.recurrence_rule,'occurrences',v_occurrences,'recipientCount',v_people,'rowCount',v_count,'fingerprint',v_hash);
end;
$$;
revoke all on function private.mobile_reminder_base(uuid,jsonb) from public,anon,authenticated;

create function private.validate_mobile_reminder_request(p jsonb) returns void language plpgsql set search_path='' as $$
declare v_keys text[];v_action text;v_value jsonb;v_key text;v_date date;
begin
 v_keys:=array['version','userId','teamId','memberId','requestNonce','target','action','base'];
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>65536 or not p ?& v_keys or p->'version'<>'2'::jsonb or jsonb_typeof(p->'action')<>'string' then raise exception 'Invalid reminder intent' using errcode='22023';end if;
 v_action:=p->>'action';if v_action in ('create','edit') then v_keys:=v_keys||array['value'];elsif v_action<>'delete' then raise exception 'Unsupported reminder action' using errcode='22023';end if;
 if not p ?& v_keys or p-v_keys<>'{}'::jsonb then raise exception 'Unexpected reminder fields' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p->v_key)<>'string' then raise exception 'Invalid reminder identity' using errcode='22023';end if;perform (p->>v_key)::uuid;
 end loop;
 if jsonb_typeof(p->'target')<>'object' or not p->'target' ?& array['kind','id'] or (p->'target')-array['kind','id']<>'{}'::jsonb
   or jsonb_typeof(p#>'{target,kind}')<>'string' or p#>>'{target,kind}' not in ('group','legacy') or jsonb_typeof(p#>'{target,id}')<>'string' then raise exception 'Invalid reminder group key' using errcode='22023';end if;
 perform (p#>>'{target,id}')::uuid;
 if v_action='create' then
  if p->'base'<>'null'::jsonb or p#>>'{target,kind}'<>'group' then raise exception 'Creation requires a new explicit group' using errcode='22023';end if;
 else
  v_value:=p->'base';v_keys:=array['kind','id','title','body','priority','eventId','targetPath','targetRole','targetProfileId','targetLabel','createdBy','createdAt','firstScheduledFor','lastScheduledFor','recurrenceRule','occurrences','recipientCount','rowCount','fingerprint'];
  if jsonb_typeof(v_value)<>'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb or v_value->>'kind' is distinct from p#>>'{target,kind}' or v_value->>'id' is distinct from p#>>'{target,id}'
   or jsonb_typeof(v_value->'fingerprint')<>'string' or v_value->>'fingerprint'!~'^[0-9a-f]{64}$' then raise exception 'Invalid complete reminder base' using errcode='22023';end if;
  if jsonb_typeof(v_value->'title')<>'string' or length(v_value->>'title')>160 or (v_value->'body'<>'null'::jsonb and (jsonb_typeof(v_value->'body')<>'string' or length(v_value->>'body')>2000))
   or jsonb_typeof(v_value->'priority')<>'string' or v_value->>'priority' not in ('normal','important','urgent') or jsonb_typeof(v_value->'recurrenceRule')<>'string' or v_value->>'recurrenceRule' not in ('none','weekly','monthly')
   or jsonb_typeof(v_value->'targetLabel')<>'string' or length(v_value->>'targetLabel')>254 or (v_value->'targetPath'<>'null'::jsonb and (jsonb_typeof(v_value->'targetPath')<>'string' or length(v_value->>'targetPath')>200)) then raise exception 'Invalid reminder base content' using errcode='22023';end if;
  foreach v_key in array array['occurrences','recipientCount','rowCount'] loop
   if jsonb_typeof(v_value->v_key)<>'number' or (v_value->>v_key)::numeric<1 or (v_value->>v_key)::numeric>(case v_key when 'occurrences' then 12 when 'recipientCount' then 5000 else 60000 end)
    or (v_value->>v_key)::numeric<>trunc((v_value->>v_key)::numeric) then raise exception 'Invalid reminder base counts' using errcode='22023';end if;
  end loop;
  if (v_value->>'recipientCount')::integer>(v_value->>'rowCount')::integer or (v_value->>'occurrences')::integer>(v_value->>'rowCount')::integer or v_value->>'kind'='legacy' and (v_value->>'rowCount')::integer<>1 then raise exception 'Inconsistent reminder base counts' using errcode='22023';end if;
  foreach v_key in array array['createdBy','eventId','targetProfileId'] loop
   if v_value->v_key<>'null'::jsonb then if jsonb_typeof(v_value->v_key)<>'string' then raise exception 'Invalid reminder base identity' using errcode='22023';end if;perform (v_value->>v_key)::uuid;end if;
  end loop;
  if v_value->'targetRole'<>'null'::jsonb then
   if jsonb_typeof(v_value->'targetRole')<>'string' or v_value->'targetProfileId'<>'null'::jsonb then raise exception 'Invalid base audience' using errcode='22023';end if;perform (v_value->>'targetRole')::public.team_role;
  end if;
  foreach v_key in array array['createdAt','firstScheduledFor','lastScheduledFor'] loop
   if jsonb_typeof(v_value->v_key)<>'string' or v_value->>v_key!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' then raise exception 'Invalid reminder base timestamp' using errcode='22023';end if;perform (v_value->>v_key)::timestamptz;
  end loop;
  if (v_value->>'firstScheduledFor')::timestamptz>(v_value->>'lastScheduledFor')::timestamptz then raise exception 'Invalid base schedule order' using errcode='22023';end if;
 end if;
 if v_action in ('create','edit') then
  v_value:=p->'value';v_keys:=array['title','body','priority'];
  if v_action='create' then v_keys:=v_keys||array['eventId','targetPath','scheduledFor','recurrence','occurrences','target'];end if;
  if jsonb_typeof(v_value)<>'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb then raise exception 'Invalid reminder content fields' using errcode='22023';end if;
  foreach v_key in array array['title','body'] loop
   if jsonb_typeof(v_value->v_key)<>'string' or length(v_value->>v_key)<1 or length(v_value->>v_key)>(case when v_key='title' then 160 else 2000 end)
    or v_value->>v_key<>btrim(v_value->>v_key,E' \t\n\r\f') then raise exception 'Invalid reminder text' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(v_value->'priority')<>'string' or v_value->>'priority' not in ('normal','important','urgent') then raise exception 'Invalid reminder priority' using errcode='22023';end if;
  if v_action='create' then
   if jsonb_typeof(v_value->'recurrence')<>'string' or v_value->>'recurrence' not in ('none','weekly','monthly') or jsonb_typeof(v_value->'occurrences')<>'number'
    or (v_value->>'occurrences')::numeric not between 1 and 12 or (v_value->>'occurrences')::numeric<>trunc((v_value->>'occurrences')::numeric)
    or jsonb_typeof(v_value->'targetPath')<>'string' or length(v_value->>'targetPath')>200
    or v_value->>'targetPath'!~'^/(reminders|dashboard|announcements|profile|members|messages|dance|songs|setlists|events)(/[0-9a-fA-F-]{36})?$' then raise exception 'Invalid reminder schedule or path' using errcode='22023';end if;
   if v_value->'eventId'<>'null'::jsonb then
    if jsonb_typeof(v_value->'eventId')<>'string' then raise exception 'Invalid event identity' using errcode='22023';end if;perform (v_value->>'eventId')::uuid;
   end if;
   if v_value->'scheduledFor'<>'null'::jsonb then
    if jsonb_typeof(v_value->'scheduledFor')<>'string' or v_value->>'scheduledFor'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid schedule date' using errcode='22023';end if;
    v_date:=(v_value->>'scheduledFor')::date;if v_date::text<>v_value->>'scheduledFor' then raise exception 'Invalid calendar date' using errcode='22023';end if;
   end if;
   -- Reuse the announcement audience validator and its strict identity/size rules.
   perform private.validate_mobile_announcement_fields(jsonb_build_object('title',v_value->'title','body',v_value->'body','category','Reminder','priority',v_value->'priority','isPinned',false,'eventId',v_value->'eventId','target',v_value->'target'),'create');
  end if;
 end if;
end;
$$;
revoke all on function private.validate_mobile_reminder_request(jsonb) from public,anon,authenticated;

create function public.mobile_read_reminder_management(p_team_id uuid,p_member_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_cutoff text;v_as_of timestamptz;v_key text;v_base jsonb;v_items jsonb:='[]';v_rows bigint:=0;v_after text;
begin
 perform private.require_mobile_reminder_manager(p_team_id,p_member_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input-array['after','asOf']<>'{}'::jsonb then raise exception 'Invalid reminder management cursor' using errcode='22023';end if;
 v_after:=p_input->>'after';
 if p_input ? 'after' and (jsonb_typeof(p_input->'after')<>'string' or v_after!~'^(group|legacy):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or not p_input ? 'asOf') then raise exception 'Invalid bound cursor' using errcode='22023';end if;
 if p_input ? 'asOf' and jsonb_typeof(p_input->'asOf')<>'string' then raise exception 'Invalid reminder cutoff' using errcode='22023';end if;
 v_cutoff:=coalesce(p_input->>'asOf',to_jsonb(clock_timestamp())#>>'{}');v_as_of:=v_cutoff::timestamptz;
 if v_as_of>clock_timestamp() then raise exception 'Future reminder cutoff' using errcode='22023';end if;
 for v_key in select private.mobile_reminder_key(n) from public.notifications n where team_id=p_team_id and (notice_group_id is not null or profile_id=auth.uid())
  group by private.mobile_reminder_key(n) having min(created_at)<=v_as_of and (v_after is null or private.mobile_reminder_key(n)>v_after) order by private.mobile_reminder_key(n) limit 100 loop
  -- Inventory cutoff only: include every current row of the selected group,
  -- including rows added after the cutoff and future scheduled deliveries.
  v_base:=private.mobile_reminder_base(p_team_id,jsonb_build_object('kind',split_part(v_key,':',1),'id',split_part(v_key,':',2)));
  v_rows:=v_rows+(v_base->>'rowCount')::bigint;if v_rows>60000 then raise exception 'Complete management page exceeds row budget' using errcode='22023';end if;
  v_items:=v_items||jsonb_build_array(v_base);
 end loop;
 return jsonb_build_object('items',v_items,'asOf',v_cutoff,'fetchedAt',clock_timestamp(),'nextCursor',case when jsonb_array_length(v_items)=0 then null else jsonb_build_object('after',v_key,'asOf',v_cutoff) end);
end;
$$;
revoke all on function public.mobile_read_reminder_management(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_read_reminder_management(uuid,uuid,jsonb) to authenticated;

create function public.mobile_apply_reminder_edit(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_target jsonb;v_saved private.mobile_reminder_edit_receipts%rowtype;v_current jsonb;v_base jsonb;v_status text;v_result jsonb;v_count bigint:=0;
 v_target_role public.team_role;v_target_profile uuid;v_label text;v_recipients uuid[];v_event uuid;v_path text;v_total integer;v_index integer;v_first timestamptz;v_scheduled timestamptz;v_month timestamp;v_recorded timestamptz;v_hash text;
begin
 perform private.validate_mobile_reminder_request(p_request);
 if v_actor is null or (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Reminder scope mismatch' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_target:=p_request->'target';
 perform pg_advisory_xact_lock(hashtextextended('reminder-edit:'||v_actor::text,0));
 perform private.require_mobile_reminder_manager(p_team_id,p_member_id);
 -- NULL-group rows also contain personal system notifications. Only the
 -- recipient may manage or replay an individual legacy notification.
 if v_target->>'kind'='legacy' and exists(select 1 from public.notifications where id=(v_target->>'id')::uuid and (team_id<>p_team_id or notice_group_id is not null or profile_id<>v_actor)) then raise exception 'Legacy notification belongs to another recipient or scope' using errcode='42501';end if;
 select * into v_saved from private.mobile_reminder_edit_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Reminder nonce belongs to another intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 -- UUID spelling/case cannot split the lock for the same logical target.
 perform pg_advisory_xact_lock(hashtextextended('reminder-target:'||(v_target->>'kind')||':'||((v_target->>'id')::uuid)::text,0));
 perform 1 from public.notifications n where n.team_id=p_team_id and private.mobile_reminder_matches(n,p_team_id,v_target) order by id for update;
 v_current:=private.mobile_reminder_base(p_team_id,v_target);
 if p_request->>'action'='create' and v_current is not null then v_status:='conflict';
 elsif p_request->>'action'<>'create' and v_current is null then v_status:='missing';
 else
  if p_request->>'action'<>'create' then
   v_base:=p_request->'base';v_base:=v_base||jsonb_build_object('createdAt',(v_base->>'createdAt')::timestamptz,'firstScheduledFor',(v_base->>'firstScheduledFor')::timestamptz,'lastScheduledFor',(v_base->>'lastScheduledFor')::timestamptz);
  end if;
  if p_request->>'action'<>'create' and v_base is distinct from v_current then
   if v_base->>'fingerprint'=v_current->>'fingerprint' then raise exception 'Reminder base metadata was altered' using errcode='22023';end if;
   v_status:='conflict';
  else
   if p_request->>'action'='create' then
    v_event:=(p_request#>>'{value,eventId}')::uuid;
    if v_event is not null then perform 1 from public.events where id=v_event and team_id=p_team_id and deleted_at is null for share;if not found then raise exception 'Choose a current event in this team' using errcode='22023';end if;end if;
    v_path:=case when v_event is not null then '/events/'||v_event::text else p_request#>>'{value,targetPath}' end;
    v_target_role:=case when p_request#>>'{value,target,kind}'='role' then (p_request#>>'{value,target,role}')::public.team_role else null end;
    select array_agg(profile_id order by id) into v_recipients from public.team_members where team_id=p_team_id and status='active' and (v_target_role is null or role=v_target_role)
     and (p_request#>>'{value,target,kind}'<>'person' or id=(p_request#>>'{value,target,memberId}')::uuid);
    if coalesce(cardinality(v_recipients),0)=0 or cardinality(v_recipients)>5000 then raise exception 'Choose one to5000 active team recipients' using errcode='22023';end if;
    if p_request#>>'{value,target,kind}'='person' then
     v_target_profile:=v_recipients[1];select coalesce(full_name,email,'Selected person') into v_label from public.profiles where id=v_target_profile for share;
     if not found or length(v_label)>254 then raise exception 'Current target profile unavailable' using errcode='22023';end if;
    elsif v_target_role is not null then v_label:=case v_target_role when 'owner' then 'Owners' when 'admin' then 'Admins' when 'pastor' then 'Pastors' when 'worship_leader' then 'Worship Leaders' when 'band_leader' then 'Band Leaders' when 'band_member' then 'Band Members' when 'dancer' then 'Dancers' when 'media' then 'Media Team' else 'Members' end;
    else v_label:='Everyone';end if;
    v_total:=case when p_request#>>'{value,recurrence}'='none' then 1 else (p_request#>>'{value,occurrences}')::integer end;
    if cardinality(v_recipients)*v_total>60000 then raise exception 'Creation exceeds complete row limit' using errcode='22023';end if;
    v_first:=case when p_request#>>'{value,scheduledFor}' is null then transaction_timestamp() else (p_request#>>'{value,scheduledFor}'||'T00:00:00+08:00')::timestamptz end;
    for v_index in 0..v_total-1 loop
     if p_request#>>'{value,recurrence}'='weekly' then v_scheduled:=v_first+make_interval(days=>v_index*7);
     elsif p_request#>>'{value,recurrence}'='monthly' then
      -- Shared website/native scheduling clamps the original Manila calendar
      -- day in every month, independent of the server or phone timezone.
      v_month:=date_trunc('month',v_first at time zone 'Asia/Manila')+make_interval(months=>v_index);
      v_scheduled:=(v_month+make_interval(days=>least(extract(day from v_first at time zone 'Asia/Manila')::integer,extract(day from v_month+interval '1 month -1 day')::integer)-1)
       +((v_first at time zone 'Asia/Manila')-date_trunc('day',v_first at time zone 'Asia/Manila'))) at time zone 'Asia/Manila';
     else v_scheduled:=v_first;end if;
     if extract(year from v_scheduled) not between 1 and 9999 then raise exception 'Reminder schedule is not ISO representable' using errcode='22023';end if;
     insert into public.notifications(team_id,profile_id,title,body,priority,event_id,target_path,target_role,target_profile_id,target_label,scheduled_for,recurrence_rule,recurrence_index,recurrence_total,notice_group_id,created_by)
      select p_team_id,recipient,p_request#>>'{value,title}',p_request#>>'{value,body}',p_request#>>'{value,priority}',v_event,v_path,v_target_role,v_target_profile,v_label,v_scheduled,p_request#>>'{value,recurrence}',v_index,v_total,(v_target->>'id')::uuid,v_actor from unnest(v_recipients) recipient;
     get diagnostics v_count=row_count;if v_count<>cardinality(v_recipients) then raise exception 'Reminder occurrence did not persist completely' using errcode='22023';end if;
    end loop;
    v_current:=private.mobile_reminder_base(p_team_id,v_target);v_count:=(v_current->>'rowCount')::bigint;
    if v_current is null or v_count is null or v_count<>cardinality(v_recipients)*v_total or v_current->>'title' is distinct from p_request#>>'{value,title}' or v_current->>'body' is distinct from p_request#>>'{value,body}' or v_current->>'priority' is distinct from p_request#>>'{value,priority}' then raise exception 'Created reminders did not persist exactly' using errcode='22023';end if;
   elsif p_request->>'action'='edit' then
    if jsonb_build_object('title',v_current->'title','body',v_current->'body','priority',v_current->'priority')=p_request->'value' then
     -- Do not route a no-op through the personal-receipt trigger or rewrite
     -- shared revisions. The immutable result honestly reports zero writes.
     v_count:=0;
    else
     v_hash:=v_current->>'fingerprint';
     update public.notifications n set title=p_request#>>'{value,title}',body=p_request#>>'{value,body}',priority=p_request#>>'{value,priority}' where n.team_id=p_team_id and private.mobile_reminder_matches(n,p_team_id,v_target);
     get diagnostics v_count=row_count;v_current:=private.mobile_reminder_base(p_team_id,v_target);
     if v_count<>(v_base->>'rowCount')::bigint or v_current->>'fingerprint'=v_hash or (v_current-'fingerprint') is distinct from ((v_base||(p_request->'value'))-'fingerprint') then raise exception 'Content-only reminder edit did not persist exactly' using errcode='22023';end if;
    end if;
   else
    delete from public.notifications n where n.team_id=p_team_id and private.mobile_reminder_matches(n,p_team_id,v_target);get diagnostics v_count=row_count;
    if v_count<>(v_base->>'rowCount')::bigint or private.mobile_reminder_base(p_team_id,v_target) is not null then raise exception 'Whole reminder group deletion incomplete' using errcode='22023';end if;v_current:=null;
   end if;
   v_status:='applied';
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'affectedCount',v_count,'recordedAt',v_recorded);
 insert into private.mobile_reminder_edit_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_reminder_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_reminder_edit(uuid,uuid,jsonb) to authenticated;
commit;

