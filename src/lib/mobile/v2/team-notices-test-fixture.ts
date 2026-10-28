import type { MobileIdentity } from '../contracts';
import type { MobileAnnouncement, MobileReminder, MobileTeamNoticesCache, MobileTeamNoticesPage } from './team-notices';
export const teamNoticeId = (n: number) => `96000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = teamNoticeId;
export const teamNoticeIdentity: MobileIdentity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: 'Team', role: 'member', permissions: [] };
export const teamNoticeTime = '2026-10-21T04:00:00Z';
export const teamAnnouncement: MobileAnnouncement = { id: id(4), title: 'Rehearsal update', body: 'Bring the full chart.\nMeet in the hall.', category: 'Team update', targetLabel: 'All team', targetRole: null,
  targetProfileId: null, priority: 'important', isPinned: true, eventId: id(7), eventName: 'Sunday service', createdAt: teamNoticeTime, createdBy: id(8), acknowledgedByMe: true };
export const teamReminder: MobileReminder = { id: id(5), title: 'Bring charts', body: 'Use the updated version.', targetPath: '/events', targetLabel: 'Band', targetRole: 'band_member', targetProfileId: null,
  priority: 'normal', eventId: id(7), createdAt: teamNoticeTime, createdBy: id(8), readAt: null, acknowledgedAt: null, scheduledFor: teamNoticeTime, recurrenceRule: 'weekly', recurrenceIndex: 1, recurrenceTotal: 4, noticeGroupId: id(9) };
export const teamNoticesPage: MobileTeamNoticesPage = { version: 2, identity: teamNoticeIdentity, kind: 'announcements', items: [teamAnnouncement], asOf: teamNoticeTime, fetchedAt: teamNoticeTime,
  nextCursor: { after: teamAnnouncement.id, asOf: teamNoticeTime } };
export const teamNoticesCache: MobileTeamNoticesCache = { version: 2, identity: teamNoticeIdentity, kind: 'announcements', items: [teamAnnouncement], fetchedAt: teamNoticeTime };
