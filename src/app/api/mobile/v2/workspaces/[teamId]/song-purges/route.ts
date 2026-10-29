import { MOBILE_SONG_PURGE_MAX_BYTES, mobileSongPurgeRequestSchema } from '@/lib/mobile/v2/song-purge';
import { purgeMobileSong } from '@/lib/server/mobile/v2/song-purge';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route, mobileV2Preflight, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) { return mobileV2Route(request, async () => { const { teamId } = await context.params; const current = await requireSelectedWorkspace(request, teamId); if ([...new URL(request.url).searchParams.keys()].length) throw new MobileApiError(400, 'song_purge_query', 'Use the exact saved purge intent.'); const input = mobileSongPurgeRequestSchema.parse(await readBoundedJson(request, MOBILE_SONG_PURGE_MAX_BYTES)); return Response.json(await purgeMobileSong({ ...current, request: input, signal: request.signal })); }); }
