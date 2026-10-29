import { z } from 'zod';
import { readMobileGroupPeople } from '@/lib/server/mobile/v2/group-channels';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string}>}){return mobileV2Route(request,async()=>{const {teamId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const params=new URL(request.url).searchParams;if([...params.keys()].some(key=>key!=='after')||params.getAll('after').length>1)throw new MobileApiError(400,'group_people_query','Use one teammate cursor.');const after=params.has('after')?z.uuid().parse(params.get('after')):null;return Response.json(await readMobileGroupPeople({...current,after,signal:request.signal}));});}
