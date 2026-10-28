import { mobileProfileFixture, profileTestId } from './profile-test-fixture';
import type { MobileProfileEditRequest, MobileProfileEditReceipt } from './profile-edit';
export const profileEditIdentity = mobileProfileFixture.identity;
export const profileEditRequest: MobileProfileEditRequest = { version: 2, userId: profileEditIdentity.userId, teamId: profileEditIdentity.teamId, memberId: profileEditIdentity.memberId, requestNonce: profileTestId(10),
  base: { fullName: mobileProfileFixture.profile.fullName, birthday: mobileProfileFixture.profile.birthday, ministries: mobileProfileFixture.membership.ministries, teamAnniversary: mobileProfileFixture.membership.teamAnniversary },
  value: { fullName: 'Updated own name', birthday: '1991-06-11', ministries: ['Guitar', 'Vocals'], teamAnniversary: '2026-01-01' } };
export const profileEditReceipt: MobileProfileEditReceipt = { version: 2, request: profileEditRequest, status: 'applied', current: profileEditRequest.value, recordedAt: '2026-10-21T05:00:00Z' };
