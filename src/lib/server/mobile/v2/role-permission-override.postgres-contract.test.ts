// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { canForTeam, resolvePermissionOverrides } from '@/lib/domain/permission-overrides';
import { assertMobileRolePermissionOverrideReceipt, mobileRolePermissionOverrideRequestSchema, mobileRolePermissionOverrideReceiptSchema,
  mobileRolePermissionOverrideQuerySchema, mobileRolePermissionOverrideRowSchema } from '@/lib/mobile/v2/role-permission-override';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileRolePermissionOverrideState } from './role-permission-override';
const evidencePath = process.env.MOBILE_ROLE_PERMISSION_OVERRIDE_PG_CASES;
it.skipIf(!evidencePath)('verifies real SQL receipts, state conversion, timestamp precision and preserved person precedence', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_ROLE_PERMISSION_OVERRIDE_PG_CASES to the disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobileRolePermissionOverrideRequestSchema, receipt: mobileRolePermissionOverrideReceiptSchema })),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), ...mobileRolePermissionOverrideQuerySchema.shape, current: mobileRolePermissionOverrideRowSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict() })),
    personRows: z.array(z.object({ role: z.string().nullable(), member_id: z.uuid(), permission: z.string(), allowed: z.boolean() })),
  }).strict().parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(27); expect(evidence.states.length).toBe(4);
  for (const item of evidence.cases) expect(assertMobileRolePermissionOverrideReceipt(item.identity, item.request, item.receipt)).toEqual(item.receipt);
  for (const { identity, state } of evidence.states) {
    mocks.selected.mockReset(); mocks.selected.mockResolvedValue(identity);
    const rpc = vi.fn(async () => ({ data: state, error: null }));
    expect(await readMobileRolePermissionOverrideState({ client: { rpc } as unknown as SupabaseClient<Database>, identity, input: { targetRole: state.targetRole, permission: state.permission } })).toEqual({ ...state, identity });
    expect(mocks.selected).toHaveBeenCalledTimes(2);
  }
  const precise = evidence.states.find(item => item.state.current?.createdAt.includes('.123456'));
  if (!precise?.state.current) throw new Error('Actual precise selected override missing.');
  const edited = evidence.cases.find(item => item.request.base?.id === precise.state.current?.id);
  expect(edited?.request.base).toEqual(precise.state.current);
  const allow = evidence.personRows.find(row => row.permission === 'events.manage' && row.allowed);
  const deny = evidence.personRows.find(row => row.permission === 'events.manage' && !row.allowed);
  if (!allow || !deny) throw new Error('Actual person precedence fixtures missing.');
  expect(canForTeam({ role: 'member', permissionOverrides: resolvePermissionOverrides(evidence.personRows, 'member', allow.member_id) }, 'events.manage')).toBe(true);
  expect(canForTeam({ role: 'member', permissionOverrides: resolvePermissionOverrides(evidence.personRows, 'member', deny.member_id) }, 'events.manage')).toBe(false);
});
