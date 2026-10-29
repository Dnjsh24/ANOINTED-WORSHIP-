import { expect, it } from 'vitest';
import { mobileWoolyRecordsRequestSchema, assertMobileWoolyRecordsResponse } from './wooly-records';
import { profileAvatarIdentity as identity } from './profile-avatar-test-fixture';
const request = { version: 2 as const, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, question: 'Find song Grace', today: '2026-10-23' };
it('binds exact questions/current identity and permits only bounded native sources/record choices', () => {
  const response = { version: 2, identity, request, reply: { kind: 'answer', text: 'Stored key D', sources: [{ label: 'Songs', href: '/songs' }] }, fetchedAt: '2026-10-23T04:00:00Z' };
  expect(assertMobileWoolyRecordsResponse(identity, request, response)).toEqual(response);
  for (const href of ['https://evil.test', '//evil.test', '/profile', '/songs?token=private']) expect(() => assertMobileWoolyRecordsResponse(identity, request, { ...response, reply: { ...response.reply, sources: [{ label: 'Link', href }] } })).toThrow();
  expect(mobileWoolyRecordsRequestSchema.safeParse({ ...request, choice: { kind: 'topic', id: 'anything' } }).success).toBe(false);
  expect(() => assertMobileWoolyRecordsResponse(identity, request, { ...response, identity: { ...identity, role: 'admin' } })).toThrow();
});
