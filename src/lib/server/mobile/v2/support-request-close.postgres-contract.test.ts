// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileSupportRequestCloseRequestSchema, mobileSupportRequestCloseReceiptSchema, assertMobileSupportRequestCloseReceipt } from '@/lib/mobile/v2/support-request-close';
vi.mock('server-only', () => ({}));
import { applyMobileSupportRequestClose } from './support-request-close';
const evidencePath = process.env.MOBILE_SUPPORT_REQUEST_CLOSE_PG_CASES;
it.skipIf(!evidencePath)('validates actual close CAS/conflict/missing receipts and server boundary with microsecond snapshots', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_SUPPORT_REQUEST_CLOSE_PG_CASES to actual disposable PostgreSQL evidence.');
  const cases = z.array(z.object({ request: mobileSupportRequestCloseRequestSchema, receipt: mobileSupportRequestCloseReceiptSchema }).strict()).parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(cases).toHaveLength(5);
  for (const { request, receipt } of cases) {
    expect(assertMobileSupportRequestCloseReceipt(request.userId, request, receipt)).toEqual(receipt);
    const client = { rpc: vi.fn(async () => ({ data: receipt, error: null })) } as unknown as SupabaseClient<Database>;
    expect(await applyMobileSupportRequestClose({ client, userId: request.userId, request })).toEqual(receipt);
  }
  expect(cases.some(item => item.receipt.status === 'applied')).toBe(true); expect(cases.some(item => item.receipt.status === 'missing')).toBe(true);
  expect(cases.filter(item => item.receipt.status === 'conflict')).toHaveLength(3);
  expect(cases.every(item => item.request.base.createdAt.includes('.123456'))).toBe(true);
});
