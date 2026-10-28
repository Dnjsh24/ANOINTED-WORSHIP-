// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileMemberRoleAssignmentReceipt, assertMobileMemberRoleState, memberRoleAssignmentSnapshotSchema,
  mobileMemberRoleAssignmentRequestSchema, mobileMemberRoleAssignmentReceiptSchema } from '@/lib/mobile/v2/member-role-assignment';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileMemberRoleState } from './member-role-assignment';
const evidencePath = process.env.MOBILE_MEMBER_ROLE_ASSIGNMENT_PG_CASES;
it.skipIf(!evidencePath)('validates actual PostgreSQL receipts and state RPC conversion with exact timestamps and legacy custom fingerprints', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_MEMBER_ROLE_ASSIGNMENT_PG_CASES to the disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobileMemberRoleAssignmentRequestSchema, receipt: mobileMemberRoleAssignmentReceiptSchema })),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), targetMemberId: z.uuid(), current: memberRoleAssignmentSnapshotSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict() })),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(28); expect(evidence.states.length).toBe(4);
  for (const item of evidence.cases) expect(assertMobileMemberRoleAssignmentReceipt(item.identity, item.request, item.receipt)).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    const result = await readMobileMemberRoleState({ client: { rpc } as unknown as SupabaseClient<Database>, identity, targetMemberId: state.targetMemberId });
    expect(result).toEqual({ ...state, identity }); expect(assertMobileMemberRoleState(identity, state.targetMemberId, result)).toEqual(result);
    expect(mocks.selected).toHaveBeenCalledTimes(2);
  }
  const custom = evidence.cases.find(item => item.request.value.customRole?.name === '' && item.receipt.status === 'applied');
  if (!custom) throw new Error('Actual custom role assignment evidence missing.');
  expect(custom.request.value.customRole?.permissions).toEqual(['team.manage', 'events.manage']);
  expect(custom.request.value.customRole?.createdAt).toContain('.123456');
  const downloaded = evidence.states.find(item => item.state.current?.id === custom.request.base.id);
  expect(downloaded?.state.current).toEqual(custom.request.base);
  expect(custom.receipt.current?.createdAt).toBe(custom.request.base.createdAt);
});
