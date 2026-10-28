import { z } from 'zod';
import { MOBILE_MESSAGE_ATTACHMENT_UPLOAD_MAX_BYTES,mobileMessageAttachmentUploadRequestSchema } from '@/lib/mobile/v2/message-attachment-upload';
import { inspectMobileMessageAttachmentUpload } from '@/lib/server/mobile/v2/message-attachment-upload';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function POST(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{const{teamId,channelId}=await context.params;z.uuid().parse(channelId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'attachment_upload_query','Use the exact saved attachment intent.');const input=mobileMessageAttachmentUploadRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_ATTACHMENT_UPLOAD_MAX_BYTES));if(input.channelId!==channelId)throw new MobileApiError(403,'attachment_upload_channel','Reopen the original conversation.');return Response.json(await inspectMobileMessageAttachmentUpload({...current,request:input,signal:request.signal}));});}

