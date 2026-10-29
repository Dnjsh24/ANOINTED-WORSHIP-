// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileCustomRoleEditReceipt, mobileCustomRoleEditReceiptSchema, mobileCustomRoleEditRequestSchema } from '@/lib/mobile/v2/custom-role-edit';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
import { readMobileTeamSettings } from './team-settings';

const evidencePath = process.env.MOBILE_CUSTOM_ROLE_EDIT_PG_CASES;
it.skipIf(!evidencePath)('validates real PostgreSQL receipts and actual catalog conversion with microseconds and unsorted legacy permissions', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_CUSTOM_ROLE_EDIT_PG_CASES to the disposable PostgreSQL contract export.');
  const evidence = z.object({ cases: z.array(z.object({ request: mobileCustomRoleEditRequestSchema, receipt: mobileCustomRoleEditReceiptSchema })),
    catalogRow: z.object({ id: z.uuid(), team_id: z.uuid(), name: z.string(), permissions: z.array(z.string()), created_at: z.string() }) }).parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBeGreaterThanOrEqual(12);
  for (const item of evidence.cases) {
    const identity = mobileIdentitySchema.parse({ userId: item.request.userId, teamId: item.request.teamId, memberId: item.request.memberId, teamName: 'Team', role: 'owner', permissions: ['team.manage'] });
    expect(assertMobileCustomRoleEditReceipt(identity, item.request, item.receipt)).toEqual(item.receipt);
  }
  const applied = evidence.cases.find(item => item.request.base.id === evidence.catalogRow.id && item.receipt.status === 'applied');
  if (!applied) throw new Error('Real catalog edit receipt missing.');
  const identity = mobileIdentitySchema.parse({ userId: applied.request.userId, teamId: applied.request.teamId, memberId: applied.request.memberId, teamName: 'Team', role: 'owner', permissions: ['team.manage'] });
  mocks.selected.mockResolvedValue(identity);
  let page = 0;
  const from = (table: string) => {
    const data = table === 'team_settings' ? null : page++ === 0 ? [evidence.catalogRow] : [];
    const response = { data, error: null };
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, gt: () => query,
      maybeSingle: () => Promise.resolve(response), then: <T>(resolve: (value: typeof response) => T) => Promise.resolve(response).then(resolve) };
    return query;
  };
  const catalog = await readMobileTeamSettings({ client: { from } as unknown as SupabaseClient<Database>, identity });
  expect(catalog.customRoles).toEqual([applied.request.base]);
  expect(catalog.customRoles[0].permissions).toEqual(['team.manage', 'events.manage']);
  expect(catalog.customRoles[0].createdAt).toContain('.123456');
});
