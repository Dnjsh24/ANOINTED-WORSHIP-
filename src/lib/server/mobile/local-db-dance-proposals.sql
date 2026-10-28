\set ON_ERROR_STOP on
-- Continue only after local-db-dance.sql in the disposable local cluster.
create table if not exists dance_test.proposal_cases(name text primary key,intent jsonb not null,receipt jsonb not null);
grant select,insert on dance_test.proposal_cases to authenticated;
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
-- Dance has no sync_revision column; generic mobile_record uses the real shared revision.
update public.dance_notes set formation_notes='Initial approved formation' where id=dance_test.id(24);
set role authenticated;
select set_config('request.jwt.claim.sub',dance_test.id(3)::text,false);
do $$declare target jsonb;request_id uuid;nonce uuid:=dance_test.id(100);before_row jsonb;intent jsonb;receipt jsonb;denied boolean:=false;revision bigint;begin
 select to_jsonb(d) into before_row from public.dance_notes d where id=dance_test.id(24);
 target:=public.get_shared_edit_target('choreography',dance_test.id(24));revision:=(target->>'revision')::bigint;
 assert revision=(before_row->>'shared_edit_revision')::bigint,'Snapshot used wrong revision';
 assert not before_row ? 'sync_revision','Unexpected Dance physical revision assumption';
 request_id:=public.submit_shared_edit_request('choreography',dance_test.id(24),revision,'{"formation_notes":"Circle"}','Improve formation',nonce);
 assert request_id=public.submit_shared_edit_request('choreography',dance_test.id(24),revision,'{"formation_notes":"Circle"}','Improve formation',nonce),'Exact proposal retry duplicated request';
 assert (select count(*)=1 from public.shared_edit_requests where requested_by=auth.uid() and request_nonce=nonce),'Duplicate request row';
 assert (select to_jsonb(d)=before_row from public.dance_notes d where id=dance_test.id(24)),'Proposal altered published chart';
 begin perform public.submit_shared_edit_request('choreography',dance_test.id(24),revision,'{"formation_notes":"Changed retry"}','Improve formation',nonce);exception when invalid_parameter_value then denied:=true;end;
 assert denied,'Nonce payload mutation accepted';
 intent:=jsonb_build_object('version',2,'userId',auth.uid(),'teamId',dance_test.team(),'memberId',(select id from public.team_members where team_id=dance_test.team() and profile_id=auth.uid()),
   'proposal',jsonb_build_object('targetType','choreography','targetId',dance_test.id(24),'revision',revision,'changes','{"formation_notes":"Circle"}'::jsonb,'reason','Improve formation','requestNonce',nonce));
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',dance_test.team(),'memberId',intent->'memberId','request',to_jsonb(r)) into receipt from public.shared_edit_requests r where id=request_id;
 assert receipt#>>'{request,status}'='pending','Fresh proposal not pending review';
 insert into dance_test.proposal_cases values('member-submit-exact-retry',intent,receipt);
 request_id:=public.submit_shared_edit_request('choreography',dance_test.id(24),revision-1,'{"outfit_notes":"White"}','Old offline snapshot',dance_test.id(101));
 intent:=jsonb_set(intent,'{proposal}',jsonb_build_object('targetType','choreography','targetId',dance_test.id(24),'revision',revision-1,'changes','{"outfit_notes":"White"}'::jsonb,'reason','Old offline snapshot','requestNonce',dance_test.id(101)));
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',dance_test.team(),'memberId',intent->'memberId','request',to_jsonb(r)) into receipt from public.shared_edit_requests r where id=request_id;
 assert receipt#>>'{request,status}'='needs_revision','Stale snapshot fabricated acceptance';
 insert into dance_test.proposal_cases values('stale-needs-revision',intent,receipt);
end$$;
select set_config('request.jwt.claim.sub',dance_test.id(2)::text,false);
do $$declare denied boolean:=false;begin
 begin perform public.submit_shared_edit_request('choreography',dance_test.id(24),1,'{"formation_notes":"Foreign"}','Other tenant',dance_test.id(102));exception when insufficient_privilege then denied:=true;end;
 assert denied,'Other tenant proposed against chart';end$$;
reset role;
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
delete from public.dance_notes where id=dance_test.id(24);
set role authenticated;
select set_config('request.jwt.claim.sub',dance_test.id(3)::text,false);
do $$declare request_id uuid;begin
 -- Existing RPC permits lookup of an already-created request after target deletion.
 -- The native server helper's selected-team chart preflight denies this case.
 request_id:=public.submit_shared_edit_request('choreography',dance_test.id(24),1,'{"formation_notes":"Circle"}','Improve formation',dance_test.id(100));
 assert request_id is not null and not exists(select 1 from public.dance_notes where id=dance_test.id(24)),'Historical request lookup revived chart';end$$;
reset role;
select 'PASS Dance proposals: actual revision, immutable nonce retries, pending/needs_revision, published preservation, tenant and historical request lookup';
