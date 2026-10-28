import { z } from 'zod';
import { MOBILE_MESSAGE_ATTACHMENT_URL_MAX_BYTES,mobileMessageAttachmentDownloadRequestSchema } from '@/lib/mobile/v2/message-attachment';
import { downloadMobileMessageAttachment } from '@/lib/server/mobile/v2/message-attachment-download';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function POST(request:Request,context:{params:Promise<{teamId:string;channelId:string;messageId:string}>}){return mobileV2Route(request,async()=>{const{teamId,channelId,messageId}=await context.params;z.uuid().parse(channelId);z.uuid().parse(messageId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'message_attachment_query','Use the exact displayed attachment metadata.');const input=mobileMessageAttachmentDownloadRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_ATTACHMENT_URL_MAX_BYTES));return Response.json(await downloadMobileMessageAttachment({...current,channelId,messageId,input,signal:request.signal}));});}
