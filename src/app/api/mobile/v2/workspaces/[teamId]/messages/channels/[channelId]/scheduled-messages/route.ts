import { z } from 'zod';
import { MOBILE_MESSAGE_SCHEDULE_MAX_BYTES,mobileMessageScheduleRequestSchema } from '@/lib/mobile/v2/message-schedule';
import { mobileMessageThreadQuerySchema } from '@/lib/mobile/v2/messages';
import { applyMobileMessageSchedule,readMobileMessageScheduledPage } from '@/lib/server/mobile/v2/message-schedule';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
type Context={params:Promise<{teamId:string;channelId:string}>};
export function POST(request:Request,context:Context){return mobileV2Route(request,async()=>{const{teamId,channelId}=await context.params;z.uuid().parse(channelId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'message_schedule_query','Use the original schedule request.');const input=mobileMessageScheduleRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_SCHEDULE_MAX_BYTES));if(input.channelId!==channelId)throw new MobileApiError(403,'message_schedule_channel','Reopen the original conversation.');return Response.json(await applyMobileMessageSchedule({...current,request:input,signal:request.signal}));});}
export function GET(request:Request,context:Context){return mobileV2Route(request,async()=>{const{teamId,channelId}=await context.params;z.uuid().parse(channelId);const current=await requireSelectedWorkspace(request,teamId);const entries=[...new URL(request.url).searchParams.entries()];if(new Set(entries.map(([key])=>key)).size!==entries.length)throw new MobileApiError(400,'message_schedule_query','Use each cursor field once.');const query=mobileMessageThreadQuerySchema.parse(Object.fromEntries(entries));const before=query.beforeCreatedAt&&query.beforeId?{createdAt:query.beforeCreatedAt,id:query.beforeId}:null;return Response.json(await readMobileMessageScheduledPage({...current,channelId,before,signal:request.signal}));});}
