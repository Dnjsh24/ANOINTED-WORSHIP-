// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { assertMobileSelfMemberLeaveReceipt, mobileSelfMemberLeaveScopeSchema, mobileSelfMemberLeaveRequestSchema,
  mobileSelfMemberLeaveReceiptSchema, mobileSelfMemberLeaveStateSchema } from '@/lib/mobile/v2/self-member-leave';
vi.mock('server-only', () => ({}));
import { applyMobileSelfMemberLeave, readMobileSelfMemberLeaveState } from './self-member-leave';
const evidencePath = process.env.MOBILE_SELF_MEMBER_LEAVE_PG_CASES;
it.skipIf(!evidencePath)('checks actual PostgreSQL departure receipts and minimal sealed/owner-conflict states through server boundaries', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_SELF_MEMBER_LEAVE_PG_CASES to actual local PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ scope: mobileSelfMemberLeaveScopeSchema, request: mobileSelfMemberLeaveRequestSchema, receipt: mobileSelfMemberLeaveReceiptSchema }).strict()),
    states: z.array(z.object({ scope: mobileSelfMemberLeaveScopeSchema, state: mobileSelfMemberLeaveStateSchema }).strict()) }).strict()
    .parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBe(6); expect(evidence.states.length).toBe(4);
  for (const { scope, request, receipt } of evidence.cases) {
    expect(assertMobileSelfMemberLeaveReceipt(scope, request, receipt)).toEqual(receipt);
    const rpc = vi.fn(async () => ({ data: receipt, error: null }));
    expect(await applyMobileSelfMemberLeave({ client: { rpc } as unknown as SupabaseClient<Database>, scope, request })).toEqual(receipt);
  }
  for (const { scope, state } of evidence.states) {
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    expect(await readMobileSelfMemberLeaveState({ client: { rpc } as unknown as SupabaseClient<Database>, scope,
      input: state.requestNonce ? { requestNonce: state.requestNonce } : {} })).toEqual(state);
  }
  expect(evidence.states.some(item => item.state.current?.member.createdAt.includes('.123456'))).toBe(true);
  expect(evidence.states.some(item => item.state.current?.member.role === 'owner')).toBe(true);
  const sealed = evidence.states.find(item => item.state.requestNonce !== null)?.state;
  expect(sealed?.current).toBeNull(); expect(Object.keys(sealed ?? {}).sort()).toEqual(['version', 'userId', 'teamId', 'memberId', 'requestNonce', 'current', 'fetchedAt'].sort());
  expect(evidence.cases.some(item => item.receipt.reason === 'related_records')).toBe(true);
});
