import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
import { assertMessageSendScope } from './message-send';
const timestamp=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6);
export const MOBILE_MESSAGE_READ_MAX_BYTES=8192;
export const mobileMessageReadIdsSchema=z.array(z.uuid()).min(1).max(50).refine(ids=>new Set(ids).size===ids.length,'Message IDs must be unique.');
export const mobileMessageReadRequestSchema=z.object({version:z.literal(2),userId:z.uuid(),teamId:z.uuid(),memberId:z.uuid(),memberCreatedAt:timestamp,channelId:z.uuid(),messageIds:mobileMessageReadIdsSchema}).strict();
export type MobileMessageReadRequest=z.infer<typeof mobileMessageReadRequestSchema>;
const read=z.object({messageId:z.uuid(),readAt:timestamp.nullable()}).strict();
export const mobileMessageReadStateSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),messageIds:mobileMessageReadIdsSchema,items:z.array(read).min(1).max(50),fetchedAt:timestamp}).strict();
export type MobileMessageReadState=z.infer<typeof mobileMessageReadStateSchema>;
export const mobileMessageReadResponseSchema=z.object({version:z.literal(2),request:mobileMessageReadRequestSchema,status:z.literal('confirmed'),items:z.array(read.extend({readAt:timestamp})).min(1).max(50),fetchedAt:timestamp}).strict();
export type MobileMessageReadResponse=z.infer<typeof mobileMessageReadResponseSchema>;
function exactIds(ids:string[],items:{messageId:string}[]){if(items.length!==ids.length||items.some((item,index)=>item.messageId!==ids[index]))throw new Error('Read proof differs from the exact displayed messages.');}
export function assertMobileMessageReadState(identity:MobileIdentity,channelId:string,messageIds:string[],value:unknown):MobileMessageReadState{const result=mobileMessageReadStateSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertMessageSendScope(identity,identity);if(result.channelId!==channelId||JSON.stringify(result.messageIds)!==JSON.stringify(messageIds))throw new Error('Read state scope differs.');exactIds(messageIds,result.items);return result;}
export function assertMobileMessageReadResponse(identity:MobileIdentity,request:MobileMessageReadRequest,value:unknown):MobileMessageReadResponse{request=mobileMessageReadRequestSchema.parse(request);assertMessageSendScope(identity,request);const result=mobileMessageReadResponseSchema.parse(value);if(JSON.stringify(result.request)!==JSON.stringify(request))throw new Error('Read proof belongs to another saved request.');exactIds(request.messageIds,result.items);return result;}
