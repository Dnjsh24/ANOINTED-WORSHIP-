import { z } from 'zod';
import { mobileMessageThreadQuerySchema } from '@/lib/mobile/v2/messages';
import { readMobileMessageThread } from '@/lib/server/mobile/v2/messages';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;channelId:string}>}){return mobileV2Route(request,async()=>{
  const {teamId,channelId}=await context.params;const current=await requireSelectedWorkspace(request,teamId);const entries=[...new URL(request.url).searchParams.entries()];
  if(entries.length>2||new Set(entries.map(([key])=>key)).size!==entries.length)throw new z.ZodError([{code:'custom',path:[],message:'Use one exact cursor pair.'}]);
  const input=mobileMessageThreadQuerySchema.parse(Object.fromEntries(entries));const before=input.beforeCreatedAt&&input.beforeId?{createdAt:input.beforeCreatedAt,id:input.beforeId}:null;
  return Response.json(await readMobileMessageThread({...current,channelId,before,signal:request.signal}));
});}
