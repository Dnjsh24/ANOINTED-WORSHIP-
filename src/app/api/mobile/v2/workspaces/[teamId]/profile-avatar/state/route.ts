import { z } from 'zod';
import { readMobileProfileAvatarState } from '@/lib/server/mobile/v2/profile-avatar';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    if ([...new URL(request.url).searchParams].length) throw new z.ZodError([{ code: 'custom', path: [], message: 'No query fields are accepted.' }]);
    const { teamId } = await context.params; const current = await requireSelectedWorkspace(request, teamId);
    return Response.json(await readMobileProfileAvatarState({ ...current, signal: request.signal }));
  });
}
