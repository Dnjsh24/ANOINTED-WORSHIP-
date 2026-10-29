import { MOBILE_MESSAGE_READ_MAX_BYTES,mobileMessageReadIdsSchema,mobileMessageReadRequestSchema } from '@/lib/mobile/v2/message-read-state';
import { readMobileMessageReadState,applyMobileMessageReads } from '@/lib/server/mobile/v2/message-read-state';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
import { readBoundedJson } from '@/lib/server/request-body';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
type RouteContext={params:Promise<{teamId:string;channelId:string}>};
export function GET(request:Request,context:RouteContext){return mobileV2Route(request,async()=>{const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const params=new URL(request.url).searchParams;if([...params.keys()].length!==1||params.getAll('messageIds').length!==1)throw new MobileApiError(400,'message_reads_query','Supply only one exact messageIds list.');const messageIds=mobileMessageReadIdsSchema.parse(params.get('messageIds')?.split(','));return Response.json(await readMobileMessageReadState({...current,channelId,messageIds,signal:request.signal}));});}
export function POST(request:Request,context:RouteContext){return mobileV2Route(request,async()=>{const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const input=mobileMessageReadRequestSchema.parse(await readBoundedJson(request,MOBILE_MESSAGE_READ_MAX_BYTES));if(input.channelId!==channelId)throw new MobileApiError(403,'message_reads_channel','Reopen the original conversation.');return Response.json(await applyMobileMessageReads({...current,request:input,signal:request.signal}));});}
