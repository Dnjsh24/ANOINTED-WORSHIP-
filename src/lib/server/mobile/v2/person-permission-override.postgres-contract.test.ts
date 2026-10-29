// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { canForTeam, resolvePermissionOverrides } from '@/lib/domain/permission-overrides';
import { assertMobilePersonPermissionOverrideReceipt, mobilePersonPermissionOverrideRequestSchema, mobilePersonPermissionOverrideReceiptSchema,
  mobilePersonPermissionOverrideQuerySchema, mobilePersonPermissionOverrideSelectionSchema } from '@/lib/mobile/v2/person-permission-override';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobilePersonPermissionOverrideState } from './person-permission-override';
const evidencePath = process.env.MOBILE_PERSON_PERMISSION_OVERRIDE_PG_CASES;
it.skipIf(!evidencePath)('verifies real SQL receipts, state conversion, timestamp precision and preserved person precedence', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_PERSON_PERMISSION_OVERRIDE_PG_CASES to the disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobilePersonPermissionOverrideRequestSchema, receipt: mobilePersonPermissionOverrideReceiptSchema })),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), ...mobilePersonPermissionOverrideQuerySchema.shape, current: mobilePersonPermissionOverrideSelectionSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict() })),
    roleRows: z.array(z.object({ role: z.string(), member_id: z.null(), permission: z.string(), allowed: z.boolean() })),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(26); expect(evidence.states.length).toBe(5);
  for (const item of evidence.cases) expect(assertMobilePersonPermissionOverrideReceipt(item.identity, item.request, item.receipt)).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    expect(await readMobilePersonPermissionOverrideState({ client: { rpc } as unknown as SupabaseClient<Database>, identity, input: { targetMemberId: state.targetMemberId, permission: state.permission } })).toEqual({ ...state, identity });
    expect(mocks.selected).toHaveBeenCalledTimes(2);
  }
  const precise = evidence.states.find(item => item.state.current?.member.createdAt.includes('.123456'));
  if (!precise?.state.current) throw new Error('Actual precise person selection missing.');
  expect(precise.state.current.override?.createdAt).toContain('.123456');
  expect(evidence.cases.some(item => JSON.stringify(item.request.base) === JSON.stringify(precise.state.current))).toBe(true);
  expect(evidence.cases.some(item => item.receipt.status === 'missing')).toBe(true);
  expect(evidence.cases.some(item => item.receipt.current?.member.role === 'owner' && item.receipt.status === 'conflict')).toBe(true);
  const row = evidence.cases.find(item => item.receipt.current?.override?.permission === 'events.manage' && item.receipt.current.override.allowed);
  if (!row?.receipt.current?.override) throw new Error('Actual person allow receipt missing.');
  const person = row.receipt.current.override;
  expect(canForTeam({ role: 'member', permissionOverrides: resolvePermissionOverrides([...evidence.roleRows,{ role:null, member_id:person.memberId,permission:person.permission,allowed:person.allowed }], 'member',person.memberId) },'events.manage')).toBe(true);
});
