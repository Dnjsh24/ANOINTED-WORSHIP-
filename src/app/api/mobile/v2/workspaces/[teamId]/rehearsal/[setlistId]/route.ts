import { z } from 'zod';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { readMobileRehearsalWorkspace } from '@/lib/server/mobile/v2/rehearsal';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string; setlistId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId, setlistId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    return Response.json(await readMobileRehearsalWorkspace({ client, identity, setlistId: z.uuid().parse(setlistId), signal: request.signal }));
  });
}
