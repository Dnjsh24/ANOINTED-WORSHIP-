import { z } from 'zod';
import { MOBILE_MESSAGE_REPLY_MAX_BYTES,mobileMessageReplyRequestSchema } from '@/lib/mobile/v2/message-reply';
import { applyMobileMessageReply } from '@/lib/server/mobile/v2/message-reply';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function POST(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{const{teamId,channelId}=await context.params;z.uuid().parse(channelId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'message_reply_query','Use the saved reply request.');const input=mobileMessageReplyRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_REPLY_MAX_BYTES));if(input.channelId!==channelId)throw new MobileApiError(403,'message_reply_channel','Reopen the original conversation.');return Response.json(await applyMobileMessageReply({...current,request:input,signal:request.signal}));});}
