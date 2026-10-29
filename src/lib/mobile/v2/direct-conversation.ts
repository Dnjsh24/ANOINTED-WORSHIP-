import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { assertMessageSendScope } from './message-send';
export const MOBILE_DIRECT_CONVERSATION_MAX_BYTES=8192;
const timestamp=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6);
export const mobileDirectConversationTargetSchema=z.object({memberId:z.uuid(),profileId:z.uuid(),createdAt:timestamp}).strict();
export type MobileDirectConversationTarget=z.infer<typeof mobileDirectConversationTargetSchema>;
export const mobileDirectConversationPeoplePageSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,memberCreatedAt:timestamp,items:z.array(z.object({target:mobileDirectConversationTargetSchema,displayName:z.string().max(500).nullable()}).strict()).max(50),after:z.uuid().nullable(),nextCursor:z.uuid().nullable(),fetchedAt:timestamp}).strict();
export type MobileDirectConversationPeoplePage=z.infer<typeof mobileDirectConversationPeoplePageSchema>;
export const mobileDirectConversationRequestSchema=z.object({version:z.literal(2),userId:z.uuid(),teamId:z.uuid(),memberId:z.uuid(),memberCreatedAt:timestamp,requestNonce:z.uuid(),target:mobileDirectConversationTargetSchema}).strict().refine(value=>value.target.memberId!==value.memberId&&value.target.profileId!==value.userId,'Choose another active teammate.');
export type MobileDirectConversationRequest=z.infer<typeof mobileDirectConversationRequestSchema>;
export const mobileDirectConversationReceiptSchema=z.object({version:z.literal(2),request:mobileDirectConversationRequestSchema,status:z.literal('opened'),channelId:z.uuid(),created:z.boolean(),recordedAt:timestamp}).strict();
export type MobileDirectConversationReceipt=z.infer<typeof mobileDirectConversationReceiptSchema>;
export function assertMobileDirectConversationPeoplePage(identity:MobileIdentity,after:string|null,value:unknown):MobileDirectConversationPeoplePage{const result=mobileDirectConversationPeoplePageSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertMessageSendScope(identity,identity);if(result.after!==after||result.items.some((row,index)=>row.target.memberId===identity.memberId||row.target.profileId===identity.userId||after!==null&&row.target.memberId<=after||index>0&&row.target.memberId<=result.items[index-1].target.memberId)||result.nextCursor!==null&&(result.items.length!==50||result.nextCursor!==result.items.at(-1)?.target.memberId))throw new Error('Teammate page scope or ordering differs.');return result;}
export function assertMobileDirectConversationReceipt(identity:MobileIdentity,request:MobileDirectConversationRequest,value:unknown):MobileDirectConversationReceipt{request=mobileDirectConversationRequestSchema.parse(request);assertMessageSendScope(identity,request);const result=mobileDirectConversationReceiptSchema.parse(value);if(JSON.stringify(result.request)!==JSON.stringify(request))throw new Error('The conversation proof belongs to another original target.');return result;}

