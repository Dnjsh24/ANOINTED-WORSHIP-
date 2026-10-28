import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { mobileMessageCursorSchema, mobileMessageChannelSchema, mobileMessageSchema, type MobileMessageCursor } from '@/lib/mobile/v2/messages';
import { assertMobileMessageSearchPage,mobileMessageSearchTermSchema } from '@/lib/mobile/v2/message-search';
import { MobileApiError } from '../context';
import { enrichDirectPeerLabels } from './direct-peer-labels';
type Context={client:SupabaseClient<Database>;identity:MobileIdentity;signal?:AbortSignal};
const denied=()=>new MobileApiError(403,'messages_access','This conversation is unavailable to your current account and channel membership.');
const unavailable=()=>new MobileApiError(503,'messages_unverified','Messages could not be verified. Refresh when connected.');
const channelFields='id,team_id,name,channel_type,updated_at,own:message_channel_members!inner(team_member_id)';
const channelRow=z.object({id:z.uuid(),team_id:z.uuid(),name:z.string(),channel_type:z.string(),updated_at:z.string(),own:z.array(z.object({team_member_id:z.uuid()}).strict()).min(1)}).strict();
function channel(value:unknown,identity:MobileIdentity){const row=channelRow.parse(value);if(row.team_id!==identity.teamId||row.own.some(member=>member.team_member_id!==identity.memberId))throw denied();return mobileMessageChannelSchema.parse({id:row.id,teamId:row.team_id,name:row.name,type:row.channel_type,updatedAt:row.updated_at});}
async function verify(context:Context){context.signal?.throwIfAborted();const workspace=await readSelectedWorkspace({client:context.client,userId:context.identity.userId,teamId:context.identity.teamId});context.signal?.throwIfAborted();try{assertTeamNoticesIdentity(context.identity,{userId:context.identity.userId,...workspace});}catch{throw denied();}}
async function ownChannel(context:Context,channelId:string){
  const query=context.client.from('message_channels').select(channelFields).eq('team_id',context.identity.teamId).eq('id',channelId).eq('own.team_member_id',context.identity.memberId);
  const result=await(context.signal?query.abortSignal(context.signal):query).maybeSingle();context.signal?.throwIfAborted();if(result.error)throw unavailable();if(!result.data)throw denied();try{return channel(result.data,context.identity);}catch(error){if(error instanceof MobileApiError)throw error;throw unavailable();}
}
const messageRow=z.object({id:z.uuid(),channel_id:z.uuid(),sender_member_id:z.uuid(),body:z.string(),created_at:z.string(),updated_at:z.string(),parent_message_id:z.uuid().nullable(),attachment_file_id:z.uuid().nullable(),scheduled_for:z.string().nullable(),is_delivered:z.literal(true),
  sender:z.object({id:z.uuid(),team_id:z.uuid(),profiles:z.object({full_name:z.string().nullable()}).nullable()}).nullable()}).strict();
export function escapeMessageSearch(value:string){return value.replace(/[\\%_]/g,character=>String.fromCharCode(92)+character);}
export async function searchMobileMessages(context:Context&{channelId:string;before:MobileMessageCursor|null;query:string}){
  const search=mobileMessageSearchTermSchema.parse(context.query);const channelId=z.uuid().parse(context.channelId);const before=context.before===null?null:mobileMessageCursorSchema.parse(context.before);await verify(context);const current=await ownChannel(context,channelId);
  let query=context.client.from('messages').select('id,channel_id,sender_member_id,body,created_at,updated_at,parent_message_id,attachment_file_id,scheduled_for,is_delivered,sender:team_members!messages_sender_member_id_fkey(id,team_id,profiles(full_name))')
    .eq('channel_id',channelId).eq('is_delivered',true).ilike('body','%'+escapeMessageSearch(search)+'%').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
  if(before)query=query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
  const result=await(context.signal?query.abortSignal(context.signal):query);context.signal?.throwIfAborted();if(result.error)throw unavailable();
  try{const rows=z.array(messageRow).max(51).parse(result.data);const items=rows.slice(0,50).reverse().map(row=>{
    if(row.channel_id!==channelId||row.sender&&(row.sender.id!==row.sender_member_id||row.sender.team_id!==context.identity.teamId))throw unavailable();
    return mobileMessageSchema.parse({id:row.id,channelId:row.channel_id,senderMemberId:row.sender_member_id,senderName:row.sender?.profiles?.full_name??null,body:row.body,createdAt:row.created_at,updatedAt:row.updated_at,parentMessageId:row.parent_message_id,attachmentFileId:row.attachment_file_id,scheduledFor:row.scheduled_for,isDelivered:row.is_delivered});});
    const [labeled]=await enrichDirectPeerLabels(context,[current]);await verify(context);await ownChannel(context,channelId);
    return assertMobileMessageSearchPage(context.identity,channelId,search,before,{version:2,query:search,identity:context.identity,channel:labeled,items,before,nextCursor:rows.length>50&&items.length?{createdAt:items[0].createdAt,id:items[0].id}:null,fetchedAt:new Date().toISOString()});
  }catch(error){if(error instanceof MobileApiError)throw error;throw unavailable();}
}

