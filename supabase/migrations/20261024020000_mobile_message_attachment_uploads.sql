-- Atomic attachment metadata/message confirmation; API verifies object bytes.
begin;
create table private.mobile_message_attachment_receipts(actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce));
alter table private.mobile_message_attachment_receipts enable row level security;
revoke all on private.mobile_message_attachment_receipts from public,anon,authenticated;
create trigger mobile_message_attachment_receipt_immutable before update or delete on private.mobile_message_attachment_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_finalize_message_attachment(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_member uuid;v_channel uuid;v_nonce uuid;v_file uuid;v_keys text[];v_key text;v_value jsonb;v_path text;v_extension text;v_actor public.team_members%rowtype;v_existing public.practice_files%rowtype;v_saved private.mobile_message_attachment_receipts%rowtype;v_message record;v_time timestamptz;v_result jsonb;
begin
 if v_user is null then raise exception 'Authenticated attachment sender required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','memberCreatedAt','channelId','requestNonce','body','file'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>16384 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid attachment intent' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','memberCreatedAt','channelId','requestNonce','body'] loop if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid attachment actor or text' using errcode='22023';end if;end loop;
 if (p_request->>'userId')::uuid<>v_user then raise exception 'Own sender required' using errcode='42501';end if;
 v_team:=(p_request->>'teamId')::uuid;v_member:=(p_request->>'memberId')::uuid;v_channel:=(p_request->>'channelId')::uuid;v_nonce:=(p_request->>'requestNonce')::uuid;
 if length(p_request->>'body') not between 1 and 2000 or p_request->>'body'~'^[[:space:]]*$' or p_request->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid exact text or incarnation' using errcode='22023';end if;
 v_value:=p_request->'file';v_keys:=array['id','fileName','mimeType','sizeBytes','sha256'];if jsonb_typeof(v_value) is distinct from 'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb then raise exception 'Invalid file descriptor' using errcode='22023';end if;
 foreach v_key in array array['id','fileName','mimeType','sha256'] loop if jsonb_typeof(v_value->v_key) is distinct from 'string' then raise exception 'Invalid file field' using errcode='22023';end if;end loop;
 v_file:=(v_value->>'id')::uuid;
 if length(v_value->>'fileName') not between 1 and 500 or v_value->>'fileName'~'[[:cntrl:]]' or v_value->>'sha256'!~'^[a-f0-9]{64}$' or jsonb_typeof(v_value->'sizeBytes') is distinct from 'number' or (v_value->>'sizeBytes')::numeric<>trunc((v_value->>'sizeBytes')::numeric) or (v_value->>'sizeBytes')::numeric not between 1 and 15728640 then raise exception 'Invalid reviewed file metadata' using errcode='22023';end if;
 v_extension:=case v_value->>'mimeType' when 'application/pdf' then 'pdf' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else null end;
 if v_extension is null then raise exception 'Unsupported attachment MIME' using errcode='22023';end if;
 v_path:=v_team::text||'/messages/'||v_user::text||'/'||v_nonce::text||'/'||v_file::text||'.'||v_extension;
 perform 1 from public.team_members where team_id=v_team order by id for update;
 select * into v_actor from public.team_members where id=v_member and team_id=v_team and profile_id=v_user and status='active';
 if not found or v_actor.created_at is distinct from (p_request->>'memberCreatedAt')::timestamptz then raise exception 'Original active membership required' using errcode='42501';end if;
 if v_actor.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor.custom_role_id and team_id=v_team for share;end if;
 if not coalesce(private.has_team_permission(v_team,'files.upload'),false) or not coalesce(private.permission_override_value(v_team,'messages.send'),v_actor.role in('owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member')) then raise exception 'Current file upload and send permissions required' using errcode='42501';end if;
 perform 1 from public.message_channels where id=v_channel and team_id=v_team for share;
 if not found then raise exception 'Current selected channel required' using errcode='42501';end if;
 perform 1 from public.message_channel_members where channel_id=v_channel and team_member_id=v_member for share;
 if not found then raise exception 'Current joined channel required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('message-attachment-actor:'||v_user::text,0));
 select * into v_saved from private.mobile_message_attachment_receipts where actor_id=v_user and request_nonce=v_nonce;
 if found then if v_saved.request is distinct from p_request then raise exception 'Nonce belongs to another attachment intent' using errcode='22023';end if;return v_saved.result;end if;
 -- Storage metadata is an additional existence guard, not a byte attestation.
 -- The authenticated API independently hashes the actual bounded object stream.
 perform 1 from storage.objects where bucket_id='practice-files' and name=v_path and (metadata->>'size')::bigint=(v_value->>'sizeBytes')::bigint and metadata->>'mimetype'=v_value->>'mimeType' for share;
 if not found then raise exception 'Original uploaded object metadata unavailable' using errcode='42501';end if;
 select * into v_existing from public.practice_files where id=v_file for update;
 if found then
  if v_existing.team_id<>v_team or v_existing.uploaded_by<>v_user or v_existing.storage_path<>v_path or v_existing.file_name<>v_value->>'fileName' or v_existing.mime_type<>v_value->>'mimeType' or v_existing.size_bytes<>(v_value->>'sizeBytes')::bigint or v_existing.song_id is not null or v_existing.event_id is not null then raise exception 'File identity belongs to another upload' using errcode='22023';end if;
 else
  if exists(select 1 from public.practice_files where storage_path=v_path) then raise exception 'Upload path already has another file identity' using errcode='22023';end if;
  insert into public.practice_files(id,team_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) values(v_file,v_team,v_path,v_value->>'fileName',v_value->>'mimeType',(v_value->>'sizeBytes')::bigint,v_user);
 end if;
 select * into v_message from public.send_message_once(v_channel,v_nonce,p_request->>'body',v_file,null,null);
 if v_message.id is null then raise exception 'Message confirmation unavailable';end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status','confirmed','fileId',v_file,'message',jsonb_build_object('id',v_message.id,'createdAt',v_message.created_at),'recordedAt',v_time);
 insert into private.mobile_message_attachment_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_user,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_finalize_message_attachment(jsonb) from public,anon;
grant execute on function public.mobile_finalize_message_attachment(jsonb) to authenticated;
commit;
