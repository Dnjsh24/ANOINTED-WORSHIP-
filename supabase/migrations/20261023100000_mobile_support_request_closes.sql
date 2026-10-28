-- Account-owned close CAS: keep a historical result after later replies or even
-- parent deletion. There is deliberately no cascading parent foreign key.
begin;
create table private.mobile_support_request_close_receipts (
 actor_id uuid not null,request_nonce uuid not null,request_id uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_support_request_close_receipts enable row level security;
revoke all on private.mobile_support_request_close_receipts from public,anon,authenticated;
create trigger mobile_support_request_close_receipt_immutable before update or delete on private.mobile_support_request_close_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.mobile_support_request_close_snapshot(p_row public.wooly_support_requests) returns jsonb language sql immutable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('createdAt',p_row.created_at,'status',p_row.status,'updatedAt',p_row.updated_at,'supportUpdatedAt',p_row.support_updated_at);
$$;
revoke all on function private.mobile_support_request_close_snapshot(public.wooly_support_requests) from public,anon,authenticated;
create function public.mobile_close_support_request(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_id uuid;v_keys text[];v_key text;v_base jsonb;v_created timestamptz;v_updated timestamptz;v_support timestamptz;
 v_parent public.wooly_support_requests%rowtype;v_saved private.mobile_support_request_close_receipts%rowtype;v_current jsonb;v_status text;v_time timestamptz;v_result jsonb;
begin
 if v_actor is null then raise exception 'Authenticated account required' using errcode='42501';end if;
 v_keys:=array['version','userId','requestId','requestNonce','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>8192 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid support close request' using errcode='22023';end if;
 foreach v_key in array array['userId','requestId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid support close scope' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor then raise exception 'Own account required' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_id:=(p_request->>'requestId')::uuid;v_base:=p_request->'base';v_keys:=array['createdAt','status','updatedAt','supportUpdatedAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or v_base->>'status' not in ('open','answered') or jsonb_typeof(v_base->'status') is distinct from 'string' then raise exception 'Review an open or answered snapshot' using errcode='22023';end if;
 foreach v_key in array array['createdAt','updatedAt','supportUpdatedAt'] loop
  if v_key='supportUpdatedAt' and v_base->v_key='null'::jsonb then continue;end if;
  if jsonb_typeof(v_base->v_key) is distinct from 'string' or v_base->>v_key !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' or not isfinite((v_base->>v_key)::timestamptz) then raise exception 'Invalid snapshot timestamp' using errcode='22023';end if;
 end loop;
 v_created:=(v_base->>'createdAt')::timestamptz;v_updated:=(v_base->>'updatedAt')::timestamptz;v_support:=(v_base->>'supportUpdatedAt')::timestamptz;
 perform pg_advisory_xact_lock(hashtextextended('support-close:'||v_actor::text,0));
 select * into v_saved from private.mobile_support_request_close_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.request_id<>v_id or v_saved.request is distinct from p_request then raise exception 'Close nonce belongs to another snapshot' using errcode='22023';end if;
  return v_saved.result;
 end if;
 select * into v_parent from public.wooly_support_requests where id=v_id for update;
 if not found then v_status:='missing';v_current:=null;
 else
  if v_parent.profile_id<>v_actor then raise exception 'Own support request required' using errcode='42501';end if;
  v_current:=private.mobile_support_request_close_snapshot(v_parent);
  if v_parent.created_at is distinct from v_created or v_parent.updated_at is distinct from v_updated or v_parent.support_updated_at is distinct from v_support or v_parent.status is distinct from v_base->>'status' then v_status:='conflict';
  else
   perform public.set_wooly_support_status(v_id,'closed');
   select * into v_parent from public.wooly_support_requests where id=v_id;
   v_current:=private.mobile_support_request_close_snapshot(v_parent);v_status:='applied';
  end if;
 end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_time);
 insert into private.mobile_support_request_close_receipts(actor_id,request_nonce,request_id,request,result,recorded_at) values(v_actor,v_nonce,v_id,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_close_support_request(jsonb) from public,anon;
grant execute on function public.mobile_close_support_request(jsonb) to authenticated;
commit;
