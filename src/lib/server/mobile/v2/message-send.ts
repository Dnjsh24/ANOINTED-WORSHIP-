import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { compareSupportReadMarkerTimes } from '@/lib/mobile/v2/support-read-marker';
import { mobileMessageSendRequestSchema,assertMessageSendScope,assertMobileMessageSendResponse,assertMobileMessageSendState,type MobileMessageSendRequest } from '@/lib/mobile/v2/message-send';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { MobileApiError } from '../context';
// The generated snapshot predates the existing message nonce migration.
type SendMessageTable=Omit<Database['public']['Tables']['messages'],'Row'|'Insert'|'Update'>&{
  Row:Database['public']['Tables']['messages']['Row']&{client_nonce:string|null};
  Insert:Database['public']['Tables']['messages']['Insert']&{client_nonce?:string|null};
  Update:Database['public']['Tables']['messages']['Update']&{client_nonce?:string|null};
};
type SendDatabase=Omit<Database,'public'>&{public:Omit<Database['public'],'Tables'|'Functions'>&{
  Tables:Omit<Database['public']['Tables'],'messages'>&{messages:SendMessageTable};
  Functions:Database['public']['Functions']&{send_message_once:{Args:{p_channel_id:string;p_client_nonce:string;p_body:string;p_attachment_file_id:null;p_scheduled_for:null;p_parent_message_id:null};Returns:{id:string;created_at:string}[]}};
}};
type Context={client:SupabaseClient<Database>;identity:MobileIdentity;request:MobileMessageSendRequest;signal?:AbortSignal};
const denied=()=>new MobileApiError(403,'message_send_access','Verify your original membership, message permission and joined conversation. Keep the original message.');
const unknown=()=>new MobileApiError(503,'message_send_unconfirmed','Sending is unconfirmed. Keep the original message and retry its exact saved request.');
const conflict=()=>new MobileApiError(409,'message_send_intent','This send nonce belongs to different message content. Keep the original message.');
type VerifyContext=Omit<Context,'request'>&{channelId:string;memberCreatedAt?:string};
async function verify(context:VerifyContext){
  context.signal?.throwIfAborted();const workspace=await readSelectedWorkspace({client:context.client,userId:context.identity.userId,teamId:context.identity.teamId});context.signal?.throwIfAborted();
  try{assertTeamNoticesIdentity(context.identity,{userId:context.identity.userId,...workspace});assertMessageSendScope(context.identity,context.identity);}catch{throw denied();}
  const memberQuery=context.client.from('team_members').select('id,team_id,profile_id,status,created_at').eq('id',context.identity.memberId).eq('team_id',context.identity.teamId).eq('profile_id',context.identity.userId).eq('status','active');
  const member=await(context.signal?memberQuery.abortSignal(context.signal):memberQuery).maybeSingle();context.signal?.throwIfAborted();
  const parsed=z.object({id:z.uuid(),team_id:z.uuid(),profile_id:z.uuid(),status:z.literal('active'),created_at:z.iso.datetime({offset:true})}).strict().safeParse(member.data);
  if(member.error||!parsed.success||parsed.data.id!==context.identity.memberId||parsed.data.team_id!==context.identity.teamId||parsed.data.profile_id!==context.identity.userId||context.memberCreatedAt!==undefined&&compareSupportReadMarkerTimes(parsed.data.created_at,context.memberCreatedAt)!==0)throw denied();
  const query=context.client.from('message_channels').select('id,team_id,own:message_channel_members!inner(team_member_id)').eq('id',context.channelId).eq('team_id',context.identity.teamId).eq('own.team_member_id',context.identity.memberId);
  const result=await(context.signal?query.abortSignal(context.signal):query).maybeSingle();context.signal?.throwIfAborted();
  const channel=z.object({id:z.uuid(),team_id:z.uuid(),own:z.array(z.object({team_member_id:z.uuid()}).strict()).min(1)}).strict().safeParse(result.data);
  if(result.error||!channel.success||channel.data.id!==context.channelId||channel.data.team_id!==context.identity.teamId||channel.data.own.some(row=>row.team_member_id!==context.identity.memberId))throw denied();
  return parsed.data.created_at;
}
export async function readMobileMessageSendState(context:Omit<Context,'request'>&{channelId:string}){const channelId=z.uuid().parse(context.channelId);const memberCreatedAt=await verify({...context,channelId});await verify({...context,channelId,memberCreatedAt});return assertMobileMessageSendState(context.identity,channelId,{version:2,identity:context.identity,channelId,memberCreatedAt,fetchedAt:new Date().toISOString()});}
async function existing(context:Context){
  const query=(context.client as SupabaseClient<SendDatabase>).from('messages').select('id,created_at,channel_id,sender_member_id,client_nonce,body,attachment_file_id,scheduled_for,parent_message_id,is_delivered')
    .eq('sender_member_id',context.identity.memberId).eq('client_nonce',context.request.requestNonce);
  const result=await(context.signal?query.abortSignal(context.signal):query).maybeSingle();context.signal?.throwIfAborted();if(result.error)throw unknown();if(result.data===null)return null;
  const parsed=z.object({id:z.uuid(),created_at:z.iso.datetime({offset:true}),channel_id:z.uuid(),sender_member_id:z.uuid(),client_nonce:z.uuid(),body:z.string(),attachment_file_id:z.uuid().nullable(),scheduled_for:z.string().nullable(),parent_message_id:z.uuid().nullable(),is_delivered:z.boolean()}).strict().safeParse(result.data);
  if(!parsed.success)throw unknown();const row=parsed.data;
  if(row.sender_member_id!==context.identity.memberId||row.client_nonce!==context.request.requestNonce||row.channel_id!==context.request.channelId||row.body!==context.request.body||row.attachment_file_id!==null||row.scheduled_for!==null||row.parent_message_id!==null||!row.is_delivered)throw conflict();
  return{id:row.id,createdAt:row.created_at};
}
export async function applyMobileMessageSend(context:Context){
  const request=mobileMessageSendRequestSchema.parse(context.request);try{assertMessageSendScope(context.identity,request);}catch{throw denied();}context={...context,request};const verification={...context,channelId:request.channelId,memberCreatedAt:request.memberCreatedAt};await verify(verification);
  let message=await existing(context);
  if(!message){
    const query=(context.client as SupabaseClient<SendDatabase>).rpc('send_message_once',{p_channel_id:request.channelId,p_client_nonce:request.requestNonce,p_body:request.body,p_attachment_file_id:null,p_scheduled_for:null,p_parent_message_id:null});
    const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();
    message=await existing(context);
    if(!message){if(result.error?.code==='42501')throw denied();if(result.error?.code==='22023')throw conflict();throw unknown();}
  }
  await verify(verification);
  try{return assertMobileMessageSendResponse(context.identity,request,{version:2,request,status:'confirmed',message});}catch{throw unknown();}
}
