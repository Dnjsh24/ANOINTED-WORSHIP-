// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileOwnershipTransferResponse, mobileOwnershipTransferRequestSchema, mobileOwnershipTransferReceiptSchema,
  mobileOwnershipTransferCurrentSchema } from '@/lib/mobile/v2/ownership-transfer';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { applyMobileOwnershipTransfer, readMobileOwnershipTransferState } from './ownership-transfer';
const evidencePath = process.env.MOBILE_OWNERSHIP_TRANSFER_PG_CASES;
it.skipIf(!evidencePath)('validates actual precise ownership receipts, demoted response identity and fresh sealed recovery', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_OWNERSHIP_TRANSFER_PG_CASES to disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, freshIdentity: mobileIdentitySchema,
    request: mobileOwnershipTransferRequestSchema, receipt: mobileOwnershipTransferReceiptSchema }).strict()),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), targetMemberId: z.uuid(), requestNonce: z.uuid().nullable(),
      current: mobileOwnershipTransferCurrentSchema, fetchedAt: z.iso.datetime({ offset: true }) }).strict() }).strict()),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(9); expect(evidence.states.length).toBe(4);
  for (const item of evidence.cases) expect(assertMobileOwnershipTransferResponse(item.identity, item.request,
    { version: 2, identity: item.freshIdentity, receipt: item.receipt }).receipt).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    expect(await readMobileOwnershipTransferState({ client: { rpc } as unknown as SupabaseClient<Database>, identity,
      input: { targetMemberId: state.targetMemberId, ...(state.requestNonce ? { requestNonce: state.requestNonce } : {}) } })).toEqual({ ...state, identity });
  }
  const applied = evidence.cases.find(item => item.receipt.status === 'applied');
  if (!applied) throw new Error('Actual applied ownership transfer missing.');
  const sealed = evidence.states.find(item => item.state.requestNonce === applied.request.requestNonce);
  if (!sealed) throw new Error('Actual sealed demoted recovery missing.');
  expect(applied.request.base.target.createdAt).toContain('.123456');
  expect(applied.request.base.target.customRoleId).not.toBeNull();
  expect(applied.freshIdentity.role).toBe('admin');
  expect(applied.freshIdentity.permissions).not.toContain('team.manage');
  expect(applied.freshIdentity.permissions).not.toContain('members.manage');
  expect(applied.receipt.current.target?.customRoleId).toBeNull();
  for (const identity of [applied.identity, applied.freshIdentity]) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValueOnce(identity).mockResolvedValue(applied.freshIdentity);
    const rpc = vi.fn(async (name: string) => ({ data: name === 'mobile_apply_ownership_transfer' ? applied.receipt : sealed.state, error: null }));
    expect(await applyMobileOwnershipTransfer({ client: { rpc } as unknown as SupabaseClient<Database>, identity, request: applied.request }))
      .toEqual({ version: 2, identity: applied.freshIdentity, receipt: applied.receipt });
  }
});
