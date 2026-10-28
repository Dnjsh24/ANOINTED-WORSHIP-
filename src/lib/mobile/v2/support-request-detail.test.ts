import { expect, it } from 'vitest';
import { mobileSupportRequestSchema } from './support-requests';
import { assertMobileSupportRequestDetail } from './support-request-detail';
const id = '99890000-0000-4000-8000-000000000001'; const timestamp = '2026-10-23T04:00:00Z';
const request = { id, profile_id: id, team_id: null, question: 'Help', details: '', page_path: '/dance?new=true', status: 'open', created_at: timestamp, updated_at: timestamp, requester_read_at: timestamp, support_updated_at: null };
it('accepts the canonical dance path but rejects remote/arbitrary query paths and false page claims', () => {
  expect(mobileSupportRequestSchema.parse(request).page_path).toBe('/dance?new=true');
  for (const page_path of ['//evil.test', 'https://evil.test', '/dance?new=false', '/profile?token=secret']) expect(mobileSupportRequestSchema.safeParse({ ...request, page_path }).success).toBe(false);
  const result = { version: 2, userId: id, requestId: id, request, messages: [], offset: 0, hasMore: false, fetchedAt: timestamp };
  expect(assertMobileSupportRequestDetail(id, id, 0, result)).toEqual(result);
  expect(() => assertMobileSupportRequestDetail(id, id, 0, { ...result, hasMore: true })).toThrow();
  expect(() => assertMobileSupportRequestDetail(id, id, 1, result)).toThrow();
});
