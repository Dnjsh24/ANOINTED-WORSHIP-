import { MOBILE_SONG_PROPOSAL_MAX_BYTES, mobileSongProposalRequestSchema } from '@/lib/mobile/v2/song-proposals';
import { submitMobileSongProposal, readMobileSongProposalStatus } from '@/lib/server/mobile/v2/song-proposals';
import { readMobileSongEditorContext } from '@/lib/server/mobile/v2/song-editor';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Route, mobileV2Preflight, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic = 'force-dynamic'; export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string; songId: string }> }) { return mobileV2Route(request, async () => {
 const { teamId, songId } = await context.params, current = await requireSelectedWorkspace(request, teamId), params = new URL(request.url).searchParams;
 if ([...params.keys()].some(key => key !== 'requestNonce') || params.getAll('requestNonce').length > 1) throw new MobileApiError(400, 'song_proposal_query', 'Read the exact original song proposal nonce.');
 return Response.json(params.has('requestNonce') ? await readMobileSongProposalStatus({ ...current, songId, requestNonce: params.get('requestNonce')!, signal: request.signal }) : await readMobileSongEditorContext({ ...current, songId, signal: request.signal }));
 }); }
export function POST(request: Request, context: { params: Promise<{ teamId: string; songId: string }> }) { return mobileV2Route(request, async () => { const { teamId, songId } = await context.params; const current = await requireSelectedWorkspace(request, teamId); if ([...new URL(request.url).searchParams.keys()].length) throw new MobileApiError(400, 'song_proposal_query', 'Submit the exact saved song proposal.'); const input = mobileSongProposalRequestSchema.parse(await readBoundedJson(request, MOBILE_SONG_PROPOSAL_MAX_BYTES)); return Response.json(await submitMobileSongProposal({ ...current, songId, request: input, signal: request.signal })); }); }
