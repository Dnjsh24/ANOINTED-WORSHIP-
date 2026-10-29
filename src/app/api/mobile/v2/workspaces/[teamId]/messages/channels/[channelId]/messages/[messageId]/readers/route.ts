import { z } from 'zod';
import { readMobileMessageReaders } from '@/lib/server/mobile/v2/message-readers';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;channelId:string;messageId:string}>}){return mobileV2Route(request,async()=>{const{teamId,channelId,messageId}=await context.params;z.uuid().parse(channelId);z.uuid().parse(messageId);const current=await requireSelectedWorkspace(request,teamId);const params=new URL(request.url).searchParams;if([...params.keys()].some(key=>key!=='after')||params.getAll('after').length>1)throw new MobileApiError(400,'message_readers_query','Use only one reader cursor.');const after=params.has('after')?z.uuid().parse(params.get('after')):null;return Response.json(await readMobileMessageReaders({...current,channelId,messageId,after,signal:request.signal}));});}
