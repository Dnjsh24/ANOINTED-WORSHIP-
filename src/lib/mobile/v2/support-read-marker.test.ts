import { expect, it } from 'vitest';
import { assertMobileSupportReadMarkerResponse, compareSupportReadMarkerTimes, mobileSupportReadMarkerRequestSchema } from './support-read-marker';
it('compares exact microseconds/offsets and binds proofs to the original account and displayed snapshot', () => {
  expect(compareSupportReadMarkerTimes('2026-10-23T04:00:00.123456Z', '2026-10-23T12:00:00.123456+08:00')).toBe(0);
  expect(compareSupportReadMarkerTimes('2026-10-23T04:00:00.123457Z', '2026-10-23T04:00:00.123456Z')).toBe(1);
  const id = '99900000-0000-4000-8000-000000000001'; const request = { version: 2 as const, userId: id, requestId: id, readUntil: '2026-10-23T04:00:00.123456Z' };
  const response = { ...request, observedReadAt: request.readUntil, fetchedAt: '2026-10-23T04:01:00Z' };
  expect(assertMobileSupportReadMarkerResponse(id, request, response)).toEqual(response);
  expect(() => assertMobileSupportReadMarkerResponse(id, request, { ...response, readUntil: '2026-10-23T04:00:00Z' })).toThrow();
  expect(() => assertMobileSupportReadMarkerResponse(id, request, { ...response, observedReadAt: '2026-10-23T04:00:00.123455Z' })).toThrow();
  expect(mobileSupportReadMarkerRequestSchema.safeParse({ ...request, asSupport: true }).success).toBe(false);
});
