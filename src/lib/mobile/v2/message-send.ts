import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
export const MOBILE_MESSAGE_SEND_MAX_BYTES=16384;
const timestamp=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6);
export const mobileMessageSendRequestSchema=z.object({version:z.literal(2),userId:z.uuid(),teamId:z.uuid(),memberId:z.uuid(),requestNonce:z.uuid(),memberCreatedAt:timestamp,channelId:z.uuid(),body:z.string().min(1).max(2000).refine(value=>value.trim().length>0,'Write a nonblank message.')}).strict();
export type MobileMessageSendRequest=z.infer<typeof mobileMessageSendRequestSchema>;
export const mobileMessageSendResponseSchema=z.object({version:z.literal(2),request:mobileMessageSendRequestSchema,status:z.literal('confirmed'),message:z.object({id:z.uuid(),createdAt:timestamp}).strict()}).strict();
export type MobileMessageSendResponse=z.infer<typeof mobileMessageSendResponseSchema>;
export const mobileMessageSendStateSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),memberCreatedAt:timestamp,fetchedAt:timestamp}).strict();
export type MobileMessageSendState=z.infer<typeof mobileMessageSendStateSchema>;
export function assertMobileMessageSendState(identity:MobileIdentity,channelId:string,value:unknown):MobileMessageSendState{const result=mobileMessageSendStateSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertMessageSendScope(identity,identity);if(result.channelId!==channelId)throw new Error('The send state belongs to another channel.');return result;}
export function assertMessageSendScope(identity:MobileIdentity,request:Pick<MobileMessageSendRequest,'userId'|'teamId'|'memberId'>){if(identity.userId!==request.userId||identity.teamId!==request.teamId||identity.memberId!==request.memberId||!identity.permissions.includes('messages.send'))throw new Error('Verify the original account, membership and current message permission.');}
export function assertMobileMessageSendResponse(identity:MobileIdentity,request:MobileMessageSendRequest,value:unknown):MobileMessageSendResponse{
  request=mobileMessageSendRequestSchema.parse(request);assertMessageSendScope(identity,request);const result=mobileMessageSendResponseSchema.parse(value);
  if(JSON.stringify(result.request)!==JSON.stringify(request))throw new Error('The send proof belongs to another original message.');return result;
}
