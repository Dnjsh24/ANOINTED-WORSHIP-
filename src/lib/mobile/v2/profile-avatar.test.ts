import { expect, it } from 'vitest';
import { mobileProfileAvatarRequestSchema, safeProfileAvatarUrl, assertMobileProfileAvatarReceipt } from './profile-avatar';
import { profileAvatarIdentity as identity, profileAvatarRequest as request, profileAvatarReceipt as receipt, profileAvatarOrigin as origin } from './profile-avatar-test-fixture';
it('binds immutable own upload path, size/type and exact applied origin while retaining raw conflict bases', () => {
  expect(assertMobileProfileAvatarReceipt(identity, request, receipt, origin)).toEqual(receipt);
  for (const value of [{ ...request, extra: true }, { ...request, value: { ...request.value, objectPath: `other/${request.requestNonce}.png` } }, { ...request, value: { ...request.value, sizeBytes: 5242881 } }, { ...request, value: { ...request.value, mimeType: 'image/gif' } }]) expect(mobileProfileAvatarRequestSchema.safeParse(value).success).toBe(false);
  for (const url of ['https://evil.test/a.png', receipt.current.avatarUrl + '?token=secret', receipt.current.avatarUrl.replace(identity.userId, request.requestNonce), receipt.current.avatarUrl.replace('https://', 'https://user:pass@')]) expect(safeProfileAvatarUrl(origin, identity.userId, url)).toBeNull();
  expect(safeProfileAvatarUrl(origin, identity.userId, receipt.current.avatarUrl)).toBe(receipt.current.avatarUrl);
  expect(() => assertMobileProfileAvatarReceipt(identity, request, { ...receipt, current: { avatarUrl: receipt.current.avatarUrl.replace(origin, 'https://evil.test') } }, origin)).toThrow();
});
