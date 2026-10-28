\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
create temporary table mobile_entity_checks(name text,status text,detail text);
create temporary table mobile_entity_state(key text,value jsonb);
do $$declare team uuid; song uuid:='30000000-0000-4000-8000-000000000002'; event_id uuid:='40000000-0000-4000-8000-000000000001'; setlist uuid:='50000000-0000-4000-8000-000000000001'; arrangement uuid:='60000000-0000-4000-8000-000000000001'; annotation uuid:='70000000-0000-4000-8000-000000000001'; dance uuid:='80000000-0000-4000-8000-000000000001';
 value jsonb; command jsonb; result jsonb; base jsonb; changed jsonb; page jsonb;
begin
 select id into team from public.teams where code='QA-54321';
 value:=jsonb_build_object('title','Second song','artist','Artist','original_key','C','bpm',120,'time_signature','4/4','lyrics_chords','[C] Test','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb);
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',song,'baseRevision',0,'baseValue',null,'value',value);
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied';
 insert into mobile_entity_checks values('song/create','PASS',null);
 begin
   value:=jsonb_build_object('name','Mobile Event','type','service','event_date','2026-10-18','starts_at','09:00','ends_at','11:00','location','Church','description','Test','rehearsal_date',null,'rehearsal_time',null,'rehearsal_end_time',null,'assignments','[]'::jsonb);
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',event_id,'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   base:=result->'record';
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',event_id,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{name}','"Changed Event"'));
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied' and result->'record'->'value'->>'name'='Changed Event';
   insert into mobile_entity_checks values('event/create-update','PASS',null);
 exception when others then insert into mobile_entity_checks values('event/create-update','FAIL',sqlstate || ' ' || sqlerrm); end;
 begin
   value:=jsonb_build_object('name','Mobile Setlist','setlist_date','2026-10-18','event_id',event_id,'location','Church','call_time','08:00','rehearsal_time','08:30','service_times','[]'::jsonb,'notes','Plan','leader_member_id',null,'song_ids',jsonb_build_array(song));
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','setlist','entityId',setlist,'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   base:=result->'record';
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','setlist','entityId',setlist,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{notes}','"Changed Plan"'));
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied' and result->'record'->'value'->>'notes'='Changed Plan';
   insert into mobile_entity_checks values('setlist/create-update-linked-event','PASS',null);
 exception when others then insert into mobile_entity_checks values('setlist/create-update-linked-event','FAIL',sqlstate || ' ' || sqlerrm); end;
 begin
   value:=jsonb_build_object('setlist_id',setlist,'song_id',song,'song_order',2,'assigned_key','D','notes','Song notes','band_notes',null,'arrangement','Intro Verse','lead_member_id',null,'youtube_url',null);
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','arrangement','entityId',arrangement,'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   base:=result->'record';
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','arrangement','entityId',arrangement,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{arrangement}','"Changed arrangement"'));
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied' and result->'record'->'value'->>'arrangement'='Changed arrangement';
   insert into mobile_entity_checks values('arrangement/create-update','PASS',null);
 exception when others then insert into mobile_entity_checks values('arrangement/create-update','FAIL',sqlstate || ' ' || sqlerrm); end;
 begin
   value:=jsonb_build_object('song_id',song,'setlist_id',setlist,'slot_id',arrangement,'notes','[]'::jsonb,'drawing',null);
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',annotation,'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   base:=result->'record';
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',annotation,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{drawing}','"data:image/png;base64,AAAA"'));
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied' and result->'record'->'value'->>'drawing'='data:image/png;base64,AAAA';
   insert into mobile_entity_checks values('annotation/create-update','PASS',null);
 exception when others then insert into mobile_entity_checks values('annotation/create-update','FAIL',sqlstate || ' ' || sqlerrm); end;
 begin
   value:=jsonb_build_object('title','Dance','song_id',song,'event_id',event_id,'choreography_notes','Step right','formation_notes',null,'outfit_notes',null,'song_title',null,'song_artist',null,'song_version',null,'video_url',null);
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','dance','entityId',dance,'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   base:=result->'record';
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','dance','entityId',dance,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{choreography_notes}','"Step left"'));
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied' and result->'record'->'value'->>'choreography_notes'='Step left';
   insert into mobile_entity_checks values('dance/create-update','PASS',null);
 exception when others then insert into mobile_entity_checks values('dance/create-update','FAIL',sqlstate || ' ' || sqlerrm); end;
 begin
   page:=public.mobile_download_page(team,jsonb_build_object('kind','event','id',event_id));
   assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType'='song');
   assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType'='setlist');
   assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType'='arrangement');
   assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType'='annotation');
   assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType'='dance');
   insert into mobile_entity_checks values('event/download-complete-graph','PASS',null);
 exception when others then insert into mobile_entity_checks values('event/download-complete-graph','FAIL',sqlstate || ' ' || sqlerrm); end;
 -- Check creation parity for website template slots with empty chart text.
 begin
   value:=jsonb_build_object('title','[Slot: Any]','artist','Template','original_key','C','bpm',null,'time_signature','4/4','lyrics_chords','','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb);
   command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
   result:=public.mobile_apply_command(team,command);
   assert result->>'status'='applied';
   insert into mobile_entity_checks values('song/empty-template-chart','PASS',null);
 exception when others then insert into mobile_entity_checks values('song/empty-template-chart','FAIL',sqlstate || ' ' || sqlerrm); end;
end$$;
table mobile_entity_checks;
