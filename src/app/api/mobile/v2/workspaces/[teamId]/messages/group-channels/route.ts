import { z } from 'zod';
import { MOBILE_GROUP_CHANNEL_MAX_BYTES,mobileGroupChannelRequestSchema } from '@/lib/mobile/v2/group-channels';
import { readMobileGroupCatalog,applyMobileGroupChannel } from '@/lib/server/mobile/v2/group-channels';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
type Context={params:Promise<{teamId:string}>};
export function GET(request:Request,context:Context){return mobileV2Route(request,async()=>{const {teamId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const params=new URL(request.url).searchParams;if([...params.keys()].some(key=>key!=='after')||params.getAll('after').length>1)throw new MobileApiError(400,'group_catalog_query','Use one group cursor.');const after=params.has('after')?z.uuid().parse(params.get('after')):null;return Response.json(await readMobileGroupCatalog({...current,after,signal:request.signal}));});}
export function POST(request:Request,context:Context){return mobileV2Route(request,async()=>{const {teamId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const input=mobileGroupChannelRequestSchema.parse(await readBoundedJson(request,MOBILE_GROUP_CHANNEL_MAX_BYTES));return Response.json(await applyMobileGroupChannel({...current,request:input,signal:request.signal}));});}
