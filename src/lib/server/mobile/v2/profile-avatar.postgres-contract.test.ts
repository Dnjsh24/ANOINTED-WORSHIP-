// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { assertMobileProfileAvatarReceipt, mobileProfileAvatarBaseSchema, mobileProfileAvatarRequestSchema, mobileProfileAvatarReceiptSchema } from '@/lib/mobile/v2/profile-avatar';
const mocks = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mobile/v2/read-workspaces', () => ({ readSelectedWorkspace: mocks.selected }));
vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://avatar-project.supabase.co', publishableKey: 'public' }) }));
import { applyMobileProfileAvatar, readMobileProfileAvatarState } from './profile-avatar';
const evidencePath = process.env.MOBILE_PROFILE_AVATAR_PG_CASES;
it.skipIf(!evidencePath)('validates actual precise avatar receipts and own-account states through the server', async () => {
  if (!evidencePath) throw new Error('Set MOBILE_PROFILE_AVATAR_PG_CASES to actual disposable PostgreSQL evidence.');
  const evidence = z.object({ cases: z.array(z.object({ identity: mobileIdentitySchema, request: mobileProfileAvatarRequestSchema, receipt: mobileProfileAvatarReceiptSchema }).strict()),
    states: z.array(z.object({ identity: mobileIdentitySchema, state: z.object({ version: z.literal(2), current: mobileProfileAvatarBaseSchema, fetchedAt: z.iso.datetime({ offset: true }) }).strict() }).strict()) }).strict()
    .parse(JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')));
  expect(evidence.cases.length).toBe(4); expect(evidence.states.length).toBe(2);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from([137,80,78,71,13,10,26,10]), { headers: { 'content-type': 'image/png' } })));
  try {
    for (const { identity, request, receipt } of evidence.cases) {
      expect(assertMobileProfileAvatarReceipt(identity, request, receipt, 'https://avatar-project.supabase.co')).toEqual(receipt);
      mocks.selected.mockResolvedValue(identity); const rpc = vi.fn(async () => ({ data: receipt, error: null }));
      expect(await applyMobileProfileAvatar({ client: { rpc } as unknown as SupabaseClient<Database>, identity, request })).toEqual(receipt);
    }
    for (const { identity, state } of evidence.states) {
      mocks.selected.mockResolvedValue(identity); const rpc = vi.fn(async () => ({ data: state, error: null }));
      expect(await readMobileProfileAvatarState({ client: { rpc } as unknown as SupabaseClient<Database>, identity })).toEqual({ ...state, identity });
    }
    expect(evidence.states.some(item => item.state.current.memberCreatedAt.includes('.123456'))).toBe(true);
    expect(evidence.cases.some(item => item.receipt.status === 'conflict')).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});
