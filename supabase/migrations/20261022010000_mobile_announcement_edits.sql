-- Durable announcement mutations only. No hosted execution is authorized here.
begin;
create table private.mobile_announcement_edit_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_announcement_edit_receipts enable row level security;
revoke all on private.mobile_announcement_edit_receipts from public,anon,authenticated;
create function private.guard_mobile_announcement_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Announcement mutation receipts are immutable' using errcode='42501';end;
$$;
revoke all on function private.guard_mobile_announcement_receipt() from public,anon,authenticated;
create trigger mobile_announcement_receipt_immutable before update or delete on private.mobile_announcement_edit_receipts
 for each row execute function private.guard_mobile_announcement_receipt();

create function private.mobile_announcement_base(p public.announcements) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('title',p.title,'body',p.body,'category',p.category,'priority',p.priority,'isPinned',coalesce(p.is_pinned,false),
 'eventId',p.event_id,'targetRole',p.target_role,'targetProfileId',p.target_profile_id,'targetLabel',p.target_label,'createdAt',p.created_at,'createdBy',p.created_by);
$$;
revoke all on function private.mobile_announcement_base(public.announcements) from public,anon,authenticated;

create function private.validate_mobile_announcement_fields(p jsonb,p_mode text) returns void language plpgsql set search_path='' as $$
declare v_key text;v_limit integer;v_keys text[];v_time timestamptz;
begin
 v_keys:=case p_mode when 'base' then array['title','body','category','priority','isPinned','eventId','targetRole','targetProfileId','targetLabel','createdAt','createdBy']
 when 'create' then array['title','body','category','priority','isPinned','eventId','target'] else array['title','body','category','priority'] end;
 if p is null or jsonb_typeof(p)<>'object' or not p ?& v_keys or p-v_keys<>'{}'::jsonb then raise exception 'Invalid announcement fields' using errcode='22023';end if;
 foreach v_key in array array['title','body','category'] loop
  v_limit:=case v_key when 'title' then 160 when 'body' then 3000 else 80 end;
  if jsonb_typeof(p->v_key)<>'string' or (p_mode<>'base' and length(p->>v_key)<1) or length(p->>v_key)>v_limit
   or (p_mode<>'base' and p->>v_key<>btrim(p->>v_key,E' \t\n\r\f')) then raise exception 'Invalid announcement text' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p->'priority')<>'string' or p->>'priority' not in ('normal','important','urgent') then raise exception 'Invalid announcement priority' using errcode='22023';end if;
 if p_mode in ('base','create') then
  if jsonb_typeof(p->'isPinned')<>'boolean' then raise exception 'Invalid announcement pin' using errcode='22023';end if;
  if p->'eventId'<>'null'::jsonb then
   if jsonb_typeof(p->'eventId')<>'string' then raise exception 'Invalid event identity' using errcode='22023';end if;
   perform (p->>'eventId')::uuid;
  end if;
 end if;
 if p_mode='base' then
  foreach v_key in array array['targetProfileId','createdBy'] loop
   if p->v_key<>'null'::jsonb then
    if jsonb_typeof(p->v_key)<>'string' then raise exception 'Invalid announcement profile identity' using errcode='22023';end if;
    perform (p->>v_key)::uuid;
   end if;
  end loop;
  if p->'targetRole'<>'null'::jsonb then
   if jsonb_typeof(p->'targetRole')<>'string' or p->'targetProfileId'<>'null'::jsonb then raise exception 'Invalid target role' using errcode='22023';end if;
   perform (p->>'targetRole')::public.team_role;
  end if;
  if jsonb_typeof(p->'targetLabel')<>'string' or length(p->>'targetLabel')>254 or jsonb_typeof(p->'createdAt')<>'string'
    or (p->>'createdAt')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' then raise exception 'Invalid announcement base' using errcode='22023';end if;
  v_time:=(p->>'createdAt')::timestamptz;
 elsif p_mode='create' then
  if jsonb_typeof(p->'target')<>'object' or jsonb_typeof(p#>'{target,kind}')<>'string' then raise exception 'Invalid audience' using errcode='22023';end if;
  if p#>>'{target,kind}'='all' then
   if p->'target'<>'{"kind":"all"}'::jsonb then raise exception 'Invalid all-team target' using errcode='22023';end if;
  elsif p#>>'{target,kind}'='role' then
   if not p->'target' ?& array['kind','role'] or (p->'target')-array['kind','role']<>'{}'::jsonb or jsonb_typeof(p#>'{target,role}')<>'string' then raise exception 'Invalid role target' using errcode='22023';end if;
   perform (p#>>'{target,role}')::public.team_role;
  elsif p#>>'{target,kind}'='person' then
   if not p->'target' ?& array['kind','memberId'] or (p->'target')-array['kind','memberId']<>'{}'::jsonb or jsonb_typeof(p#>'{target,memberId}')<>'string' then raise exception 'Invalid person target' using errcode='22023';end if;
   perform (p#>>'{target,memberId}')::uuid;
  else raise exception 'Unsupported audience' using errcode='22023';end if;
 end if;
end;
$$;
revoke all on function private.validate_mobile_announcement_fields(jsonb,text) from public,anon,authenticated;

create function public.mobile_apply_announcement_edit(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_id uuid;v_action text;v_keys text[];v_member public.team_members%rowtype;
 v_row public.announcements%rowtype;v_saved private.mobile_announcement_edit_receipts%rowtype;v_current jsonb;v_status text;v_result jsonb;v_recorded timestamptz;
 v_target_role public.team_role;v_target_profile uuid;v_target_label text;v_recipients uuid[];v_event uuid;v_count bigint;v_expected jsonb;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected announcement manager required' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>65536
  or not p_request ?& array['version','userId','teamId','memberId','requestNonce','announcementId','action','base'] or p_request->'version'<>'2'::jsonb
  or jsonb_typeof(p_request->'action')<>'string' then raise exception 'Invalid announcement request' using errcode='22023';end if;
 v_action:=p_request->>'action';
 v_keys:=array['version','userId','teamId','memberId','requestNonce','announcementId','action','base'];
 if v_action in ('create','edit') then v_keys:=v_keys||array['value'];elsif v_action='pin' then v_keys:=v_keys||array['isPinned'];elsif v_action<>'delete' then raise exception 'Unsupported announcement action' using errcode='22023';end if;
 if not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb then raise exception 'Unexpected announcement fields' using errcode='22023';end if;
 if exists(select 1 from unnest(array['userId','teamId','memberId','requestNonce','announcementId']) k where jsonb_typeof(p_request->k)<>'string') then raise exception 'Invalid announcement identity' using errcode='22023';end if;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Announcement scope mismatch' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_id:=(p_request->>'announcementId')::uuid;
 if v_action='create' then
  if p_request->'base'<>'null'::jsonb then raise exception 'Creation requires an absent base' using errcode='22023';end if;
  perform private.validate_mobile_announcement_fields(p_request->'value','create');
 else
  perform private.validate_mobile_announcement_fields(p_request->'base','base');
  if v_action='edit' then perform private.validate_mobile_announcement_fields(p_request->'value','edit');end if;
  if v_action='pin' and jsonb_typeof(p_request->'isPinned')<>'boolean' then raise exception 'Invalid pin intent' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('announcement-edit:'||v_actor::text,0));
 -- Permission edits use the same membership locks. Audience/actor membership cannot
 -- disappear between validation, creation and delivery receipt insertion.
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found or v_member.role not in ('owner','admin') or not coalesce(private.has_team_permission(p_team_id,'members.manage'),false)
  or (v_action in ('edit','pin') and not coalesce(private.can_review_shared_edit(p_team_id,'announcement'),false)) then raise exception 'Current announcement management permission required' using errcode='42501';end if;
 -- Current authorization is mandatory even for a historical lost-reply replay.
 select * into v_saved from private.mobile_announcement_edit_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Announcement nonce belongs to another immutable intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('announcement-target:'||v_id::text,0));
 select * into v_row from public.announcements where id=v_id for update;
 if found and v_row.team_id<>p_team_id then raise exception 'Announcement belongs to another team' using errcode='42501';end if;
 v_current:=case when found then private.mobile_announcement_base(v_row) else null end;
 if v_action='create' and v_current is not null then v_status:='conflict';
 elsif v_action<>'create' and v_current is null then v_status:='missing';
 elsif v_action<>'create' and ((v_current-'createdAt') is distinct from ((p_request->'base')-'createdAt') or v_row.created_at is distinct from (p_request#>>'{base,createdAt}')::timestamptz) then v_status:='conflict';
 else
  if v_action='create' then
   v_event:=(p_request#>>'{value,eventId}')::uuid;
   if v_event is not null then
    perform 1 from public.events where id=v_event and team_id=p_team_id and deleted_at is null for share;
    if not found then raise exception 'Choose a current event in this team' using errcode='22023';end if;
   end if;
   v_target_role:=case when p_request#>>'{value,target,kind}'='role' then (p_request#>>'{value,target,role}')::public.team_role else null end;
   select array_agg(tm.profile_id order by tm.id) into v_recipients from public.team_members tm
    where tm.team_id=p_team_id and tm.status='active' and (v_target_role is null or tm.role=v_target_role)
     and (p_request#>>'{value,target,kind}'<>'person' or tm.id=(p_request#>>'{value,target,memberId}')::uuid);
   if coalesce(cardinality(v_recipients),0)=0 or cardinality(v_recipients)>5000 then raise exception 'Choose one to 5000 current team recipients' using errcode='22023';end if;
   if p_request#>>'{value,target,kind}'='person' then
    v_target_profile:=v_recipients[1];
    select coalesce(full_name,email,'Selected person') into v_target_label from public.profiles where id=v_target_profile for share;
    if not found or length(v_target_label)>254 then raise exception 'Current target profile unavailable' using errcode='22023';end if;
   elsif v_target_role is not null then
    v_target_label:=case v_target_role when 'owner' then 'Owners' when 'admin' then 'Admins' when 'pastor' then 'Pastors' when 'worship_leader' then 'Worship Leaders'
     when 'band_leader' then 'Band Leaders' when 'band_member' then 'Band Members' when 'dancer' then 'Dancers' when 'media' then 'Media Team' else 'Members' end;
   else v_target_label:='Everyone';end if;
   insert into public.announcements(id,team_id,title,body,category,priority,is_pinned,event_id,target_role,target_profile_id,target_label,created_by)
    values(v_id,p_team_id,p_request#>>'{value,title}',p_request#>>'{value,body}',p_request#>>'{value,category}',p_request#>>'{value,priority}',(p_request#>>'{value,isPinned}')::boolean,
     v_event,v_target_role,v_target_profile,v_target_label,v_actor) returning * into v_row;
   insert into public.announcement_receipts(announcement_id,team_id,profile_id) select v_id,p_team_id,recipient from unnest(v_recipients) recipient;
   get diagnostics v_count=row_count;
   if v_count<>cardinality(v_recipients) then raise exception 'Delivery receipts did not persist completely' using errcode='22023';end if;
  elsif v_action='edit' then
   update public.announcements set title=p_request#>>'{value,title}',body=p_request#>>'{value,body}',category=p_request#>>'{value,category}',priority=p_request#>>'{value,priority}' where id=v_id and team_id=p_team_id returning * into v_row;
  elsif v_action='pin' then
   update public.announcements set is_pinned=(p_request->>'isPinned')::boolean where id=v_id and team_id=p_team_id returning * into v_row;
  else
   delete from public.announcements where id=v_id and team_id=p_team_id;
   if not found then raise exception 'Announcement deletion did not persist' using errcode='22023';end if;
  end if;
  v_current:=case when v_action='delete' then null else private.mobile_announcement_base(v_row) end;v_status:='applied';
  if v_action='create' then
   v_expected:=(p_request->'value')-'target'||jsonb_build_object('targetRole',v_target_role,'targetProfileId',v_target_profile,'targetLabel',v_target_label,'createdBy',v_actor);
   if (v_current-'createdAt') is distinct from v_expected then raise exception 'Created announcement fields did not persist exactly' using errcode='22023';end if;
  elsif v_action in ('edit','pin') then
   v_expected:=(p_request->'base')||case when v_action='edit' then p_request->'value' else jsonb_build_object('isPinned',p_request->'isPinned') end;
   if (v_current-'createdAt') is distinct from (v_expected-'createdAt') or v_row.created_at is distinct from (v_expected->>'createdAt')::timestamptz then raise exception 'Announcement fields did not persist exactly' using errcode='22023';end if;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_recorded);
 insert into private.mobile_announcement_edit_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_announcement_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_announcement_edit(uuid,uuid,jsonb) to authenticated;
commit;
