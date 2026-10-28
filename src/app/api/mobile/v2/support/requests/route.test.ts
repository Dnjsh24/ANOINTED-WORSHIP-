// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { readMobileSupportRequests } from '@/lib/server/mobile/v2/support-requests';
import { GET } from './route';
const userId = '99890000-0000-4000-8000-000000000001';
function setup(rows: unknown[] = []) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
  const result = { data: rows, error: null };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  chain.range.mockReturnValue(Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) }));
  const from = vi.fn(() => chain); return { chain, from, client: { from } as unknown as SupabaseClient<Database> };
}
it('requires verified account authentication, rejects extra/duplicate query fields and reads only own ordered fifty rows', async () => {
  const { client, chain, from } = setup(); mocks.user.mockResolvedValue({ client, userId });
  const result = await GET(new Request('https://example.test?offset=50'));
  expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ version: 2, userId, requests: [], offset: 50 });
  expect(from).toHaveBeenCalledWith('wooly_support_requests'); expect(chain.eq).toHaveBeenCalledWith('profile_id', userId);
  expect(chain.order.mock.calls).toEqual([['updated_at', { ascending: false }], ['id', { ascending: true }]]); expect(chain.range).toHaveBeenCalledWith(50, 99);
  for (const query of ['?offset=0&offset=1', '?teamId=anything', '?offset=1000001']) expect((await GET(new Request(`https://example.test${query}`))).status).toBe(400);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.'));
  expect((await GET(new Request('https://example.test'))).status).toBe(401); expect(from).toHaveBeenCalledOnce();
});
it('fails closed if data includes another account, including a support-staff-expanded result', async () => {
  const timestamp = '2026-10-23T04:00:00Z';
  const row = { id: userId, profile_id: '99890000-0000-4000-8000-000000000002', team_id: null, question: 'Help', details: '', page_path: '/profile', status: 'open', created_at: timestamp, updated_at: timestamp, requester_read_at: timestamp, support_updated_at: null };
  await expect(readMobileSupportRequests({ ...setup([row]), userId, offset: 0 })).rejects.toMatchObject({ status: 503 });
});
