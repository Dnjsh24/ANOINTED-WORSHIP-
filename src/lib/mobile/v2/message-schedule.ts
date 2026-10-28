import { z } from 'zod';
import { mobileIdentitySchema,type MobileIdentity } from '../contracts';
import { mobileMessageCursorSchema,type MobileMessageCursor } from './messages';
import { mobileMessageSendRequestSchema,assertMessageSendScope } from './message-send';
import { assertTeamNoticesIdentity } from './team-notices';
import { compareSupportReadMarkerTimes } from './support-read-marker';
export const MOBILE_MESSAGE_SCHEDULE_MAX_BYTES=16384;
const time=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=6);
export const mobileMessageScheduleInstantSchema=z.iso.datetime({offset:true}).refine(value=>(value.match(/\.(\d+)/)?.[1].length??0)<=3).transform(value=>new Date(value).toISOString());
export const mobileMessageScheduleRequestSchema=mobileMessageSendRequestSchema.extend({scheduledFor:mobileMessageScheduleInstantSchema});
export type MobileMessageScheduleRequest=z.infer<typeof mobileMessageScheduleRequestSchema>;
export const mobileMessageScheduleResponseSchema=z.object({version:z.literal(2),request:mobileMessageScheduleRequestSchema,status:z.literal('confirmed'),message:z.object({id:z.uuid(),createdAt:time,scheduledFor:mobileMessageScheduleInstantSchema,isDelivered:z.boolean()}).strict()}).strict();
export type MobileMessageScheduleResponse=z.infer<typeof mobileMessageScheduleResponseSchema>;
export const mobileMessageScheduledPageSchema=z.object({version:z.literal(2),identity:mobileIdentitySchema,channelId:z.uuid(),items:z.array(z.object({id:z.uuid(),body:z.string().min(1).max(2000),createdAt:time,scheduledFor:mobileMessageScheduleInstantSchema,isDelivered:z.literal(false)}).strict()).max(50),before:mobileMessageCursorSchema.nullable(),nextCursor:mobileMessageCursorSchema.nullable(),fetchedAt:time}).strict();
export type MobileMessageScheduledPage=z.infer<typeof mobileMessageScheduledPageSchema>;
export function assertMobileMessageScheduleResponse(identity:MobileIdentity,request:MobileMessageScheduleRequest,value:unknown):MobileMessageScheduleResponse{request=mobileMessageScheduleRequestSchema.parse(request);assertMessageSendScope(identity,request);const result=mobileMessageScheduleResponseSchema.parse(value);if(JSON.stringify(result.request)!==JSON.stringify(request)||result.message.scheduledFor!==request.scheduledFor)throw new Error('Schedule confirmation differs from the original message.');return result;}
function compare(a:MobileMessageCursor,b:MobileMessageCursor){return compareSupportReadMarkerTimes(a.createdAt,b.createdAt)||(a.id<b.id?-1:a.id>b.id?1:0);}
export function assertMobileMessageScheduledPage(identity:MobileIdentity,channelId:string,before:MobileMessageCursor|null,value:unknown):MobileMessageScheduledPage{const result=mobileMessageScheduledPageSchema.parse(value);assertTeamNoticesIdentity(identity,result.identity);assertMessageSendScope(identity,identity);if(result.channelId!==channelId||JSON.stringify(result.before)!==JSON.stringify(before)||result.items.some((row,index)=>before!==null&&compare(row,before)>=0||index>0&&compare(result.items[index-1],row)>=0)||result.nextCursor!==null&&(result.items.length!==50||compare(result.nextCursor,result.items[0])!==0))throw new Error('Scheduled message page scope or cursor differs.');return result;}
