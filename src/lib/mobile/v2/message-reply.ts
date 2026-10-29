import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { mobileMessageSendRequestSchema,assertMessageSendScope } from './message-send';
export const MOBILE_MESSAGE_REPLY_MAX_BYTES=16384;
export const mobileMessageReplyRequestSchema=mobileMessageSendRequestSchema.extend({parentMessageId:z.uuid()});
export type MobileMessageReplyRequest=z.infer<typeof mobileMessageReplyRequestSchema>;
export const mobileMessageReplyResponseSchema=z.object({version:z.literal(2),request:mobileMessageReplyRequestSchema,status:z.literal('confirmed'),message:z.object({id:z.uuid(),createdAt:z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6)}).strict()}).strict();
export type MobileMessageReplyResponse=z.infer<typeof mobileMessageReplyResponseSchema>;
export function assertMobileMessageReplyResponse(identity:MobileIdentity,request:MobileMessageReplyRequest,value:unknown):MobileMessageReplyResponse{request=mobileMessageReplyRequestSchema.parse(request);assertMessageSendScope(identity,request);const result=mobileMessageReplyResponseSchema.parse(value);if(JSON.stringify(result.request)!==JSON.stringify(request))throw new Error('Reply confirmation differs from the original text and parent.');return result;}
