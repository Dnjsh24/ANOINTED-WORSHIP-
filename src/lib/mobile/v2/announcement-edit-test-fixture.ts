import type { MobileIdentity } from '../contracts';
import type { AnnouncementEditBase, MobileAnnouncementEditReceipt, MobileAnnouncementEditRequest } from './announcement-edit';
export const announcementEditId = (n: number) => `97000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const announcementEditIdentity: MobileIdentity = { userId: announcementEditId(1), teamId: announcementEditId(2), memberId: announcementEditId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage', 'announcements.create'] };
export const announcementEditBase: AnnouncementEditBase = { title: 'Original notice', body: 'Full original body', category: 'General', priority: 'normal', isPinned: false, eventId: null,
  targetRole: null, targetProfileId: null, targetLabel: 'Everyone', createdAt: '2026-10-22T00:00:00Z', createdBy: announcementEditIdentity.userId };
export const announcementEditRequest: Extract<MobileAnnouncementEditRequest, { action: 'edit' }> = { version: 2, userId: announcementEditIdentity.userId, teamId: announcementEditIdentity.teamId, memberId: announcementEditIdentity.memberId,
  requestNonce: announcementEditId(4), announcementId: announcementEditId(5), action: 'edit', base: announcementEditBase, value: { title: 'Updated notice', body: 'Updated full body', category: 'Service', priority: 'important' } };
export const announcementEditReceipt: MobileAnnouncementEditReceipt = { version: 2, request: announcementEditRequest, status: 'applied', current: { ...announcementEditBase, ...announcementEditRequest.value }, recordedAt: '2026-10-22T01:00:00Z' };
