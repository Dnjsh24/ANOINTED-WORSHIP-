import { readMobileSongEditorContext } from '@/lib/server/mobile/v2/song-editor';
import { mobileV2Route, mobileV2Preflight, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic = 'force-dynamic'; export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string; songId: string }> }) { return mobileV2Route(request, async () => { const { teamId, songId } = await context.params; const current = await requireSelectedWorkspace(request, teamId); if ([...new URL(request.url).searchParams.keys()].length) throw new MobileApiError(400, 'song_editor_query', 'Read the current selected song editor context.'); return Response.json(await readMobileSongEditorContext({ ...current, songId, signal: request.signal })); }); }
