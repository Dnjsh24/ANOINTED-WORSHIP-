// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { selfMemberLeaveScope as scope, selfMemberLeaveRequest as request, selfMemberLeaveReceipt as receipt, selfMemberLeaveState as state } from '@/lib/mobile/v2/self-member-leave-test-fixture';
vi.mock('server-only', () => ({}));
import { applyMobileSelfMemberLeave, readMobileSelfMemberLeaveState } from './self-member-leave';
function client(data: unknown, code?: string) { return { rpc: vi.fn(async () => ({ data, error: code ? { code } : null })) } as unknown as SupabaseClient<Database>; }
it('accepts sealed deletion without a post-delete workspace lookup and validates fresh absence proof', async () => {
  expect(await applyMobileSelfMemberLeave({ client: client(receipt), scope, request })).toEqual(receipt);
  const proof = { ...state, current: null, requestNonce: request.requestNonce };
  expect(await readMobileSelfMemberLeaveState({ client: client(proof), scope, input: { requestNonce: request.requestNonce } })).toEqual(proof);
  await expect(readMobileSelfMemberLeaveState({ client: client(state), scope, input: { requestNonce: request.requestNonce } })).rejects.toMatchObject({ status: 503 });
  await expect(applyMobileSelfMemberLeave({ client: client({ ...receipt, unexpected: true }), scope, request })).rejects.toMatchObject({ status: 503 });
});
it('retains exact saved intent on access, payload, concurrency and transport failures', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['40P01', 409], ['XX000', 503]] as const)
    await expect(applyMobileSelfMemberLeave({ client: client(null, code), scope, request })).rejects.toMatchObject({ status });
  const controller = new AbortController(); controller.abort(); const db = client(receipt);
  await expect(applyMobileSelfMemberLeave({ client: db, scope, request, signal: controller.signal })).rejects.toThrow(); expect(db.rpc).not.toHaveBeenCalled();
});
