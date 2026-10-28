import { z } from 'zod';
import { mobileMessageChannelsQuerySchema } from '@/lib/mobile/v2/messages';
import { readMobileMessageChannels } from '@/lib/server/mobile/v2/messages';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string}>}){return mobileV2Route(request,async()=>{
  const {teamId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const entries=[...new URL(request.url).searchParams.entries()];
  if(entries.length>1)throw new z.ZodError([{code:'custom',path:[],message:'Use at most one after cursor.'}]);const input=mobileMessageChannelsQuerySchema.parse(Object.fromEntries(entries));
  return Response.json(await readMobileMessageChannels({...current,after:input.after??null,signal:request.signal}));
});}
