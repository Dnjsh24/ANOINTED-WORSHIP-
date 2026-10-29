import { expect, it } from 'vitest';
import { mobileSupportRequestCommandSchema, normalizeSupportRequestPagePath, assertMobileSupportRequestConfirmation } from './support-request-commands';
const userId = '99890000-0000-4000-8000-000000000001'; const requestId = '99890000-0000-4000-8000-000000000002';
it('accepts only reviewed own requester intents and exact row-backed confirmations', () => {
  const intent = { version: 2 as const, kind: 'create' as const, userId, requestId, teamId: null, question: 'Help', details: '', pagePath: '/help' };
  expect(mobileSupportRequestCommandSchema.parse(intent)).toEqual(intent);
  for (const value of [{ ...intent, asSupport: true }, { ...intent, question: ' Help ' }, { ...intent, pagePath: '/dance?new=true' }]) expect(mobileSupportRequestCommandSchema.safeParse(value).success).toBe(false);
  expect(normalizeSupportRequestPagePath('/dance?new=true')).toBe('/');
  const result = { version: 2, intent, status: 'confirmed', record: { id: requestId, createdAt: '2026-10-23T04:00:00Z' } };
  expect(assertMobileSupportRequestConfirmation(userId, intent, result)).toEqual(result);
  expect(() => assertMobileSupportRequestConfirmation(userId, intent, { ...result, intent: { ...intent, question: 'Changed' } })).toThrow();
});
