import { MOBILE_MESSAGE_SEND_MAX_BYTES,mobileMessageSendRequestSchema } from '@/lib/mobile/v2/message-send';
import { applyMobileMessageSend } from '@/lib/server/mobile/v2/message-send';
import { readBoundedJson } from '@/lib/server/request-body';
import { MobileApiError } from '@/lib/server/mobile/context';
import { mobileV2Preflight,mobileV2Route,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function POST(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{
  const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const input=mobileMessageSendRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_SEND_MAX_BYTES));
  if(input.channelId!==channelId)throw new MobileApiError(403,'message_send_channel','Reopen the original conversation for this saved message.');
  return Response.json(await applyMobileMessageSend({...current,request:input,signal:request.signal}));
});}
