import { mobileMessageSearchQuerySchema } from '@/lib/mobile/v2/message-search';
import { searchMobileMessages } from '@/lib/server/mobile/v2/message-search';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const params=new URL(request.url).searchParams;const entries=[...params.entries()];if(new Set(entries.map(([key])=>key)).size!==entries.length)throw new MobileApiError(400,'message_search_query','Supply each query field once.');const query=mobileMessageSearchQuerySchema.parse(Object.fromEntries(entries));const before=query.beforeCreatedAt&&query.beforeId?{createdAt:query.beforeCreatedAt,id:query.beforeId}:null;return Response.json(await searchMobileMessages({...current,channelId,query:query.q,before,signal:request.signal}));});}
