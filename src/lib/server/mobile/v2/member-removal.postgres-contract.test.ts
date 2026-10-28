// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileMemberRoleState, memberRoleAssignmentSnapshotSchema } from '@/lib/mobile/v2/member-role-assignment';
import { assertMobileMemberRemovalReceipt, mobileMemberRemovalRequestSchema, mobileMemberRemovalReceiptSchema } from '@/lib/mobile/v2/member-removal';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileMemberRoleState } from './member-role-assignment';
const evidencePath = process.env.MOBILE_MEMBER_REMOVAL_PG_CASES;
it.skipIf(!evidencePath)('validates actual PostgreSQL removal receipts, unchanged state conversion and existing foreign-key semantics', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_MEMBER_REMOVAL_PG_CASES to the disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobileMemberRemovalRequestSchema, receipt: mobileMemberRemovalReceiptSchema })),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), targetMemberId: z.uuid(), current: memberRoleAssignmentSnapshotSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict() })),
    foreignKeys: z.array(z.object({ table: z.string(), deleteAction: z.enum(['a', 'r', 'c', 'n', 'd']), definition: z.string() }).strict()),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(14); expect(evidence.states.length).toBe(7);
  for (const item of evidence.cases) expect(assertMobileMemberRemovalReceipt(item.identity, item.request, item.receipt)).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    const result = await readMobileMemberRoleState({ client: { rpc } as unknown as SupabaseClient<Database>, identity, targetMemberId: state.targetMemberId });
    expect(result).toEqual({ ...state, identity }); expect(assertMobileMemberRoleState(identity, state.targetMemberId, result)).toEqual(result);
    expect(mocks.selected).toHaveBeenCalledTimes(2);
  }
  const applied = evidence.cases.find(item => item.receipt.status === 'applied' && item.request.base.createdAt.includes('.123456'));
  if (!applied) throw new Error('Actual precise member removal evidence missing.');
  const downloaded = evidence.states.find(item => item.state.current?.id === applied.request.base.id);
  expect(downloaded?.state.current).toEqual(applied.request.base);
  expect(evidence.cases.some(item => item.receipt.status === 'blocked' && item.receipt.reason === 'related_records')).toBe(true);
  expect(evidence.foreignKeys.some(item => item.table.endsWith('messages') && item.deleteAction === 'r')).toBe(true);
  expect(evidence.foreignKeys.some(item => item.table.endsWith('team_permission_overrides') && item.deleteAction === 'c')).toBe(true);
  expect(evidence.foreignKeys.some(item => item.table.endsWith('setlists') && item.deleteAction === 'n')).toBe(true);
});
