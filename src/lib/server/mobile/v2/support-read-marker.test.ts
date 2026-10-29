// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
vi.mock('server-only', () => ({}));
import { applyMobileSupportReadMarker } from './support-read-marker';
const id = (n: number) => `99900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = { version: 2 as const, userId: id(1), requestId: id(2), readUntil: '2026-10-23T04:00:00.123456Z' };
const row = { id: id(2), profile_id: id(1), created_at: '2026-10-23T03:00:00Z', support_updated_at: request.readUntil, requester_read_at: '2026-10-23T03:00:00Z' };
function setup(rows: unknown[]) {
  const result = (data: unknown) => Object.assign(Promise.resolve({ data, error: null }), { abortSignal: () => Promise.resolve({ data, error: null }) });
  const chain = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(() => result(rows.shift() ?? null)) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.abortSignal.mockReturnValue(chain);
  const from = vi.fn(() => chain); const rpc = vi.fn(() => result(null)); return { client: { from, rpc } as unknown as SupabaseClient<Database>, chain, rpc };
}
it('sends only the displayed timestamp and proves a monotonic marker while a newer reply stays unread', async () => {
  const db = setup([row, { ...row, support_updated_at: '2026-10-23T04:00:00.123457Z', requester_read_at: request.readUntil }]);
  expect(await applyMobileSupportReadMarker({ ...db, userId: id(1), request })).toMatchObject({ ...request, observedReadAt: request.readUntil });
  expect(db.rpc).toHaveBeenCalledWith('read_wooly_support_request', { p_id: id(2), p_read_until: request.readUntil });
  expect(db.chain.eq.mock.calls).toEqual([['id', id(2)], ['profile_id', id(1)], ['id', id(2)], ['profile_id', id(1)]]);
  expect(await applyMobileSupportReadMarker({ ...setup([{ ...row, requester_read_at: request.readUntil }, { ...row, requester_read_at: request.readUntil }]), userId: id(1), request })).toMatchObject({ observedReadAt: request.readUntil });
});
it('denies missing/foreign/future snapshots before mutation and retains unconfirmed markers', async () => {
  for (const before of [null, { ...row, profile_id: id(99) }, { ...row, support_updated_at: '2026-10-23T04:00:00.123455Z' }]) {
    const db = setup([before]); await expect(applyMobileSupportReadMarker({ ...db, userId: id(1), request })).rejects.toMatchObject({ status: 403 }); expect(db.rpc).not.toHaveBeenCalled();
  }
  await expect(applyMobileSupportReadMarker({ ...setup([row, row]), userId: id(1), request })).rejects.toMatchObject({ status: 503 });
});
