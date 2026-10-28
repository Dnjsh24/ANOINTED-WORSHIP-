import { readMobileGroupOwnMembership } from '@/lib/server/mobile/v2/group-channels';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'group_own_query','Own membership proof has no query fields.');return Response.json(await readMobileGroupOwnMembership({...current,channelId,signal:request.signal}));});}
