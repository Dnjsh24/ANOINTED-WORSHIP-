import { z } from 'zod';
import { readMobileMessageAttachment } from '@/lib/server/mobile/v2/message-attachment';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;channelId:string;messageId:string}>}){return mobileV2Route(request,async()=>{const {teamId,channelId,messageId}=await context.params;z.uuid().parse(channelId);z.uuid().parse(messageId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'message_attachment_query','Attachment metadata has no query fields.');return Response.json(await readMobileMessageAttachment({...current,channelId,messageId,signal:request.signal}));});}
