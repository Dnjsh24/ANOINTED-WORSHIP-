import { expect, it } from 'vitest';
import { mobileTeamOnboardingCommandSchema, assertMobileTeamOnboardingPreview, assertMobileTeamOnboardingResult } from './team-onboarding';
const id = (n: number) => `99920000-0000-4000-8000-${String(n).padStart(12, '0')}`;
it('accepts only own nonprivileged requests and verified actual team previews', () => {
  const command = { version: 2, kind: 'join', userId: id(1), requestId: id(2), teamId: id(3), code: 'AB-12345', requestedRole: 'member' };
  for (const requestedRole of ['owner', 'admin', 'band_leader']) expect(mobileTeamOnboardingCommandSchema.safeParse({ ...command, requestedRole }).success).toBe(false);
  const input = mobileTeamOnboardingCommandSchema.parse(command); const timestamp = '2026-10-23T04:00:00Z';
  const current = { id: id(2), userId: id(1), teamId: id(3), requestedRole: 'member', status: 'approved', createdAt: timestamp, updatedAt: timestamp, reviewedAt: timestamp };
  expect(assertMobileTeamOnboardingResult(id(1), input, { version: 2, userId: id(1), request: input, status: 'confirmed', current, fetchedAt: timestamp }).current?.status).toBe('approved');
  expect(() => assertMobileTeamOnboardingPreview(id(1), 'AB-12345', { version: 2, userId: id(1), code: 'AB-12345', team: { id: id(3), name: 'Actual team', members: 1 }, fetchedAt: timestamp })).toThrow();
});
