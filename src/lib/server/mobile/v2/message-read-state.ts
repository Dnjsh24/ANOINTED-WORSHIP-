import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { mobileMessageReadIdsSchema,mobileMessageReadRequestSchema,assertMobileMessageReadState,assertMobileMessageReadResponse,type MobileMessageReadRequest } from '@/lib/mobile/v2/message-read-state';
import { assertMessageSendScope } from '@/lib/mobile/v2/message-send';
import { compareSupportReadMarkerTimes } from '@/lib/mobile/v2/support-read-marker';
import { readMobileMessageSendState } from './message-send';
import { MobileApiError } from '../context';
type Context={client:SupabaseClient<Database>;identity:MobileIdentity;channelId:string;signal?:AbortSignal};
const denied=()=>new MobileApiError(403,'message_reads_access','Verify the original membership and displayed messages. A removed or unavailable message cannot be marked read.');
const unknown=()=>new MobileApiError(503,'message_reads_unconfirmed','Read confirmation is unavailable. Keep the exact original displayed message IDs.');
async function verify(context:Context,memberCreatedAt?:string){const state=await readMobileMessageSendState(context);if(memberCreatedAt!==undefined&&compareSupportReadMarkerTimes(state.memberCreatedAt,memberCreatedAt)!==0)throw denied();}
async function visible(context:Context,ids:string[]){const query=context.client.from('messages').select('id,channel_id,is_delivered').eq('channel_id',context.channelId).eq('is_delivered',true).in('id',ids).limit(50);const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();if(result.error)throw unknown();const rows=z.array(z.object({id:z.uuid(),channel_id:z.uuid(),is_delivered:z.literal(true)}).strict()).max(50).safeParse(result.data);if(!rows.success||rows.data.length!==ids.length||new Set(rows.data.map(row=>row.id)).size!==ids.length||rows.data.some(row=>row.channel_id!==context.channelId||!ids.includes(row.id)))throw denied();}
async function reads(context:Context,ids:string[]){const query=context.client.from('message_reads').select('message_id,profile_id,read_at').eq('profile_id',context.identity.userId).in('message_id',ids).limit(50);const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();if(result.error)throw unknown();const rows=z.array(z.object({message_id:z.uuid(),profile_id:z.uuid(),read_at:z.iso.datetime({offset:true}).nullable()}).strict()).max(50).safeParse(result.data);if(!rows.success||new Set(rows.data.map(row=>row.message_id)).size!==rows.data.length||rows.data.some(row=>row.profile_id!==context.identity.userId||!ids.includes(row.message_id)))throw unknown();return ids.map(messageId=>({messageId,readAt:rows.data.find(row=>row.message_id===messageId)?.read_at??null}));}
export async function readMobileMessageReadState(context:Context&{messageIds:string[]}){const messageIds=mobileMessageReadIdsSchema.parse(context.messageIds);z.uuid().parse(context.channelId);await verify(context);await visible(context,messageIds);const items=await reads(context,messageIds);await visible(context,messageIds);await verify(context);return assertMobileMessageReadState(context.identity,context.channelId,messageIds,{version:2,identity:context.identity,channelId:context.channelId,messageIds,items,fetchedAt:new Date().toISOString()});}
export async function applyMobileMessageReads(context:Omit<Context,'channelId'>&{request:MobileMessageReadRequest}){
 const request=mobileMessageReadRequestSchema.parse(context.request);try{assertMessageSendScope(context.identity,request);}catch{throw denied();}const current={...context,channelId:request.channelId};await verify(current,request.memberCreatedAt);await visible(current,request.messageIds);
 // Composite primary keys are the idempotency boundary. Do not rewrite first
 // read timestamps or advance the unrelated channel-wide unread marker.
 const query=context.client.from('message_reads').upsert(request.messageIds.map(message_id=>({message_id,profile_id:context.identity.userId})),{onConflict:'message_id,profile_id',ignoreDuplicates:true});
 const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();
 const items=await reads(current,request.messageIds);await visible(current,request.messageIds);await verify(current,request.memberCreatedAt);
 if(items.some(row=>row.readAt===null)){if(result.error?.code==='42501')throw denied();throw unknown();}
 try{return assertMobileMessageReadResponse(context.identity,request,{version:2,request,status:'confirmed',items,fetchedAt:new Date().toISOString()});}catch{throw unknown();}
}
