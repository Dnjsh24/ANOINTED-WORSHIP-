import type { MobileProfileAvatarRequest } from './profile-avatar';
import { ownershipTransferIdentity } from './ownership-transfer-test-fixture';
export const profileAvatarIdentity = { ...ownershipTransferIdentity, role: 'member' as const, permissions: [] };
export const profileAvatarOrigin = 'https://avatar-project.supabase.co';
export const profileAvatarRequest: MobileProfileAvatarRequest = { version: 2, userId: profileAvatarIdentity.userId, teamId: profileAvatarIdentity.teamId, memberId: profileAvatarIdentity.memberId,
  requestNonce: '99890000-0000-4000-8000-000000000001', base: { avatarUrl: null, memberCreatedAt: '2026-10-23T03:04:05.123456Z' },
  value: { objectPath: `${profileAvatarIdentity.userId}/99890000-0000-4000-8000-000000000001.png`, sha256: '00'.repeat(32), mimeType: 'image/png', sizeBytes: 8 } };
export const profileAvatarReceipt = { version: 2 as const, request: profileAvatarRequest, status: 'applied' as const, current: { avatarUrl: `${profileAvatarOrigin}/storage/v1/object/public/profile-avatars/${profileAvatarRequest.value.objectPath}` }, recordedAt: '2026-10-23T04:00:00Z' };
