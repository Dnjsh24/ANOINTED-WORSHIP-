import { expect, it } from 'vitest';
import { mobileSupportRequestsQuerySchema, assertMobileSupportRequests } from './support-requests';
it('accepts only bounded integer pagination and the requested account/page response', () => {
  expect(mobileSupportRequestsQuerySchema.parse({})).toEqual({ offset: 0 });
  expect(mobileSupportRequestsQuerySchema.parse({ offset: '1000000' })).toEqual({ offset: 1000000 });
  for (const input of [{ offset: '-1' }, { offset: '1.5' }, { offset: '1000001' }, { offset: '1e2' }, { teamId: 'anything' }]) expect(mobileSupportRequestsQuerySchema.safeParse(input).success).toBe(false);
  const userId = '99890000-0000-4000-8000-000000000001'; const value = { version: 2, userId, requests: [], offset: 0, fetchedAt: '2026-10-23T04:00:00Z' };
  expect(assertMobileSupportRequests(userId, 0, value)).toEqual(value);
  expect(() => assertMobileSupportRequests(userId, 1, value)).toThrow();
});
