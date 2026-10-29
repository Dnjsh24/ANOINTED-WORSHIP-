import { MOBILE_DIRECT_CONVERSATION_MAX_BYTES,mobileDirectConversationRequestSchema } from '@/lib/mobile/v2/direct-conversation';
import { openMobileDirectConversation } from '@/lib/server/mobile/v2/direct-conversation';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function POST(request:Request,context:{params:Promise<{teamId:string}>}){return mobileV2Route(request,async()=>{const {teamId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const input=mobileDirectConversationRequestSchema.parse(await readBoundedJson(request,MOBILE_DIRECT_CONVERSATION_MAX_BYTES));return Response.json(await openMobileDirectConversation({...current,request:input,signal:request.signal}));});}
