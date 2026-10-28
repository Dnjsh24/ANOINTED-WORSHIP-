-- The existing workspace bootstrap is atomic. Persist its result in the same
-- transaction so an unknown reply never causes a second bootstrap on retry.
begin;
create table private.mobile_team_creation_receipts (
 actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_team_creation_receipts enable row level security;
revoke all on private.mobile_team_creation_receipts from public,anon,authenticated;
create trigger mobile_team_creation_receipt_immutable before update or delete on private.mobile_team_creation_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_create_team_workspace(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_value jsonb;v_saved private.mobile_team_creation_receipts%rowtype;
 v_team uuid;v_member uuid;v_channel uuid;v_status text;v_reason text;v_workspace jsonb;v_time timestamptz;v_result jsonb;v_constraint text;
begin
 if v_actor is null then raise exception 'Authenticated account required' using errcode='42501';end if;
 v_keys:=array['version','userId','requestNonce','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>8192 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid team creation intent' using errcode='22023';end if;
 foreach v_key in array array['userId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid creation identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor then raise exception 'Own account required' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_value:=p_request->'value';v_keys:=array['name','code','location','callTime','rehearsalTime'];
 if jsonb_typeof(v_value) is distinct from 'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb then raise exception 'Review the exact bootstrap fields' using errcode='22023';end if;
 foreach v_key in array v_keys loop
  if jsonb_typeof(v_value->v_key) is distinct from 'string' then raise exception 'Invalid creation field' using errcode='22023';end if;
 end loop;
 if length(v_value->>'name') not between 2 and 80 or btrim(v_value->>'name')<>v_value->>'name' or length(v_value->>'location') not between 1 and 160 or btrim(v_value->>'location')<>v_value->>'location'
 or v_value->>'code' !~ '^[A-Z]{2,3}-[0-9]{5}$' or v_value->>'callTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' or v_value->>'rehearsalTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' then raise exception 'Invalid reviewed team details' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('team-creation:'||v_actor::text,0));
 select * into v_saved from private.mobile_team_creation_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.request is distinct from p_request then raise exception 'Creation nonce belongs to another reviewed intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 begin
  select created.team_id,created.team_member_id,created.channel_id into v_team,v_member,v_channel from public.create_team_workspace(v_value->>'name',v_value->>'code',v_value->>'location',(v_value->>'callTime')::time,(v_value->>'rehearsalTime')::time) created;
  if v_team is null or v_member is null or v_channel is null then raise exception 'Workspace bootstrap not confirmed';end if;
  v_status:='applied';v_workspace:=jsonb_build_object('teamId',v_team,'memberId',v_member,'channelId',v_channel,'name',v_value->>'name','code',v_value->>'code');
 exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint<>'teams_code_key' then raise;end if;
  v_status:='blocked';v_reason:='existing_code';v_workspace:=null;
 end;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'workspace',v_workspace,'reason',v_reason,'recordedAt',v_time);
 insert into private.mobile_team_creation_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_actor,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_create_team_workspace(jsonb) from public,anon;
grant execute on function public.mobile_create_team_workspace(jsonb) to authenticated;
commit;
