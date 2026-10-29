// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileCustomRoleRetirementReceipt, mobileCustomRoleRetirementRequestSchema, mobileCustomRoleRetirementReceiptSchema,
  mobileCustomRoleRetirementSelectionSchema } from '@/lib/mobile/v2/custom-role-retirement';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileCustomRoleRetirementState } from './custom-role-retirement';
const evidencePath = process.env.MOBILE_CUSTOM_ROLE_RETIREMENT_PG_CASES;
it.skipIf(!evidencePath)('validates actual atomic retirement receipts, complete precise assignments and honest oversize state', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_CUSTOM_ROLE_RETIREMENT_PG_CASES to disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobileCustomRoleRetirementRequestSchema, receipt: mobileCustomRoleRetirementReceiptSchema })),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), roleId: z.uuid(), current: mobileCustomRoleRetirementSelectionSchema.nullable(),
      assignedCount: z.number().int().nonnegative(), reason: z.literal('member_limit').nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict() })),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(15); expect(evidence.states.length).toBe(4);
  for (const item of evidence.cases) expect(assertMobileCustomRoleRetirementReceipt(item.identity, item.request, item.receipt)).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    expect(await readMobileCustomRoleRetirementState({ client: { rpc } as unknown as SupabaseClient<Database>, identity, roleId: state.roleId })).toEqual({ ...state, identity });
    expect(mocks.selected).toHaveBeenCalledTimes(2);
  }
  const precise = evidence.states.find(item => item.state.current?.role.createdAt?.includes('.123456'));
  if (!precise?.state.current) throw new Error('Actual precise role assignment catalog missing.');
  expect(precise.state.current.role.permissions).toEqual(['team.manage', 'events.manage']);
  expect(precise.state.current.members.some(member => member.status === 'inactive')).toBe(true);
  expect(precise.state.current.members.some(member => member.createdAt.includes('.123456'))).toBe(true);
  expect(evidence.cases.some(item => item.receipt.status === 'applied' && JSON.stringify(item.request.base) === JSON.stringify(precise.state.current))).toBe(true);
  expect(evidence.states.some(item => item.state.reason === 'member_limit' && item.state.assignedCount === 101 && item.state.current === null)).toBe(true);
  expect(evidence.cases.some(item => item.receipt.status === 'blocked' && item.receipt.reason === 'protected_member')).toBe(true);
});
