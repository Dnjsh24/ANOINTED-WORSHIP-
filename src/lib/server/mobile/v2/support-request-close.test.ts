// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
vi.mock('server-only', () => ({}));
import { applyMobileSupportRequestClose } from './support-request-close';
const id = '99910000-0000-4000-8000-000000000001'; const time = '2026-10-23T04:00:00.123456Z';
const request = { version: 2 as const, userId: id, requestId: id, requestNonce: id, base: { createdAt: time, status: 'open' as const, updatedAt: time, supportUpdatedAt: null } };
it('validates the immutable close receipt and safely retains auth/payload/unknown failures', async () => {
  const receipt = { version: 2, request, status: 'applied', current: { ...request.base, status: 'closed' }, recordedAt: time };
  const rpc = vi.fn(async () => ({ data: receipt, error: null })); const client = { rpc } as unknown as SupabaseClient<Database>;
  expect(await applyMobileSupportRequestClose({ client, userId: id, request })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('mobile_close_support_request', { p_request: request });
  for (const [code, status] of [['42501', 403], ['22023', 409], ['P0001', 503]] as const) {
    const db = { rpc: async () => ({ data: null, error: { code, message: 'private database detail' } }) } as unknown as SupabaseClient<Database>;
    await expect(applyMobileSupportRequestClose({ client: db, userId: id, request })).rejects.toMatchObject({ status, message: expect.not.stringContaining('private database') });
  }
  await expect(applyMobileSupportRequestClose({ client, userId: '99910000-0000-4000-8000-000000000002', request })).rejects.toMatchObject({ status: 403 });
});
