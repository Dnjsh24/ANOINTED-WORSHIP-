import { z } from 'zod';
import { mobileOwnershipTransferQuerySchema } from '@/lib/mobile/v2/ownership-transfer';
import { readMobileOwnershipTransferState } from '@/lib/server/mobile/v2/ownership-transfer';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length < 1 || entries.length > 2 || new Set(entries.map(([key]) => key)).size !== entries.length) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use one targetMemberId and optionally one requestNonce.' }]);
    const input = mobileOwnershipTransferQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobileOwnershipTransferState({ client, identity, input, signal: request.signal }));
  });
}
