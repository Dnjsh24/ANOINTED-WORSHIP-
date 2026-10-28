import { MOBILE_OWNERSHIP_TRANSFER_MAX_BYTES, mobileOwnershipTransferRequestSchema } from '@/lib/mobile/v2/ownership-transfer';
import { applyMobileOwnershipTransfer } from '@/lib/server/mobile/v2/ownership-transfer';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileOwnershipTransferRequestSchema.parse(await readBoundedJson(request, MOBILE_OWNERSHIP_TRANSFER_MAX_BYTES));
    return Response.json(await applyMobileOwnershipTransfer({ client, identity, request: input, signal: request.signal }));
  });
}
