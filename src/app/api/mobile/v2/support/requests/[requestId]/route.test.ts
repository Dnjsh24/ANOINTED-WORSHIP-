// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile/v2/context', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/mobile/v2/context')>(), requireMobileUser: mocks.user }));
import { MobileApiError } from '@/lib/server/mobile/context';
import { readMobileSupportRequestDetail } from '@/lib/server/mobile/v2/support-request-detail';
import { GET } from './route';
const id = (n: number) => `99890000-0000-4000-8000-${String(n).padStart(12, '0')}`; const userId = id(1); const requestId = id(2); const timestamp = '2026-10-23T04:00:00Z';
const parent = { id: requestId, profile_id: userId, team_id: null, question: 'Help', details: '', page_path: '/profile', status: 'open', created_at: timestamp, updated_at: timestamp, requester_read_at: timestamp, support_updated_at: null };
function setup(request: unknown = parent, rows: unknown[] = []) {
  const response = (data: unknown) => { const result = { data, error: null }; return Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) }); };
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.abortSignal.mockReturnValue(chain); chain.range.mockImplementation(() => response(rows)); chain.maybeSingle.mockImplementation(() => response(request));
  const from = vi.fn(() => chain); const client = { from } as unknown as SupabaseClient<Database>; return { chain, from, client };
}
it('returns only own parent/messages with deterministic truthful overflow and no membership or mutation calls', async () => {
  const rows = Array.from({ length: 201 }, (_, n) => ({ id: id(n + 10), request_id: requestId, author_id: id(3), author_kind: 'support', body: 'Reply', created_at: timestamp, parent: { profile_id: userId } }));
  const { client, chain, from } = setup(parent, rows); mocks.user.mockResolvedValue({ client, userId });
  const result = await GET(new Request('https://example.test?offset=200'), { params: Promise.resolve({ requestId }) });
  expect(result.status).toBe(200); const body = await result.json(); expect(body.messages).toHaveLength(200); expect(body.hasMore).toBe(true); expect(body.offset).toBe(200);
  expect(body.messages[0]).not.toHaveProperty('parent'); expect(from.mock.calls).toEqual([['wooly_support_requests'], ['wooly_support_messages']]);
  expect(chain.eq.mock.calls).toEqual([['id', requestId], ['profile_id', userId], ['request_id', requestId], ['parent.profile_id', userId]]);
  expect(chain.order.mock.calls).toEqual([['created_at', { ascending: true }], ['id', { ascending: true }]]); expect(chain.range).toHaveBeenCalledWith(200, 400);
});
it('does not disclose missing/foreign parents and fails closed for staff-expanded or mismatched message rows', async () => {
  const absent = setup(null); expect(await readMobileSupportRequestDetail({ ...absent, userId, requestId, offset: 0 })).toMatchObject({ request: null, messages: [], hasMore: false }); expect(absent.from).toHaveBeenCalledOnce();
  await expect(readMobileSupportRequestDetail({ ...setup({ ...parent, profile_id: id(99) }), userId, requestId, offset: 0 })).rejects.toMatchObject({ status: 503 });
  const message = { id: id(3), request_id: requestId, author_id: id(4), author_kind: 'support', body: 'Private', created_at: timestamp, parent: { profile_id: id(99) } };
  await expect(readMobileSupportRequestDetail({ ...setup(parent, [message]), userId, requestId, offset: 0 })).rejects.toMatchObject({ status: 503 });
});
it('requires verified account and rejects unknown or duplicated pagination fields', async () => {
  const db = setup(); mocks.user.mockResolvedValue({ client: db.client, userId }); const context = { params: Promise.resolve({ requestId }) };
  for (const query of ['?asSupport=true', '?offset=0&offset=1', '?offset=-1']) expect((await GET(new Request(`https://example.test${query}`), context)).status).toBe(400);
  mocks.user.mockRejectedValueOnce(new MobileApiError(401, 'session', 'Sign in.')); expect((await GET(new Request('https://example.test'), context)).status).toBe(401); expect(db.from).not.toHaveBeenCalled();
});
