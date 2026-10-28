import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertOwnershipTransferScope, assertMobileOwnershipTransferReceipt, assertMobileOwnershipTransferResponse, assertMobileOwnershipTransferState,
  mobileOwnershipTransferRequestSchema, mobileOwnershipTransferCurrentSchema, mobileOwnershipTransferQuerySchema,
  type MobileOwnershipTransferRequest, type MobileOwnershipTransferQuery } from '@/lib/mobile/v2/ownership-transfer';
import { MobileApiError } from '../context';
type TransferDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_ownership_transfer: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_ownership_transfer_state: { Args: { p_team_id: string; p_member_id: string; p_target_member_id: string; p_request_nonce: string | null }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'ownership_transfer_access', 'Current ownership or the exact recorded transfer recovery could not be verified. The saved transfer is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'ownership_transfer_validation', 'Review the saved ownership transfer. Its nonce may only retry the original owner and target.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'ownership_transfer_retry', 'A concurrent membership or ownership change is in progress. Retry the exact saved transfer.');
  return new MobileApiError(503, 'ownership_transfer_unknown', 'Ownership could not be confirmed. Keep the saved transfer and retry it exactly.');
}
async function currentIdentity(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = mobileIdentitySchema.parse({ userId: context.identity.userId, ...current });
  try { assertOwnershipTransferScope(context.identity, identity); } catch { throw failure('42501'); }
  return identity;
}
const readResultSchema = z.object({ version: z.literal(2), targetMemberId: z.uuid(), requestNonce: z.uuid().nullable(), current: mobileOwnershipTransferCurrentSchema, fetchedAt: z.iso.datetime({ offset: true }) }).strict();
async function readSqlState(context: Context, input: MobileOwnershipTransferQuery) {
  const query = (context.client as SupabaseClient<TransferDatabase>).rpc('mobile_read_ownership_transfer_state', {
    p_team_id: context.identity.teamId, p_member_id: context.identity.memberId, p_target_member_id: input.targetMemberId, p_request_nonce: input.requestNonce ?? null,
  });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  try { return readResultSchema.parse(response.data); } catch { throw failure('unverified'); }
}
export async function applyMobileOwnershipTransfer(context: Context & { request: MobileOwnershipTransferRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileOwnershipTransferRequestSchema.parse(context.request);
  try { assertOwnershipTransferScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await currentIdentity(context);
  const query = (context.client as SupabaseClient<TransferDatabase>).rpc('mobile_apply_ownership_transfer', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  let receipt;
  try { receipt = assertMobileOwnershipTransferReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
  const input = { targetMemberId: request.base.target.id, ...(receipt.status === 'applied' ? { requestNonce: request.requestNonce } : {}) };
  const state = await readSqlState(context, input); const freshIdentity = await currentIdentity(context);
  try {
    assertMobileOwnershipTransferState(identity, input, { ...state, identity: freshIdentity });
    if (receipt.status === 'applied' && JSON.stringify(state.current) !== JSON.stringify(receipt.current)) throw new Error('The fresh recovery state differs from the sealed transfer.');
    return assertMobileOwnershipTransferResponse(identity, request, { version: 2, identity: freshIdentity, receipt });
  } catch { throw failure('unverified'); }
}
export async function readMobileOwnershipTransferState(context: Context & { input: MobileOwnershipTransferQuery }) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileOwnershipTransferQuerySchema.parse(context.input);
  context = { ...context, identity, input }; await currentIdentity(context);
  const state = await readSqlState(context, input); const freshIdentity = await currentIdentity(context);
  try { return assertMobileOwnershipTransferState(identity, input, { ...state, identity: freshIdentity }); } catch { throw failure('unverified'); }
}
