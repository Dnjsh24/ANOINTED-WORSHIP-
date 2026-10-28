import { z } from 'zod';
import { readMobileSongTrashState } from '@/lib/server/mobile/v2/song-trash';
import { mobileV2Route,mobileV2Preflight,requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic='force-dynamic';export const OPTIONS=mobileV2Preflight;
export function GET(request:Request,context:{params:Promise<{teamId:string;songId:string}>}){return mobileV2Route(request,async()=>{const{teamId,songId}=await context.params;z.uuid().parse(songId);const current=await requireSelectedWorkspace(request,teamId);if([...new URL(request.url).searchParams.keys()].length)throw new MobileApiError(400,'song_restore_query','Song restore state has no query fields.');return Response.json(await readMobileSongTrashState({...current,songId,signal:request.signal}));});}
