import type { MobileIdentity } from '../contracts';
import type { MobileTeamSettings } from './team-settings';
export const teamSettingsId = (n: number) => `99300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const teamSettingsIdentity: MobileIdentity = { userId: teamSettingsId(1), teamId: teamSettingsId(2), memberId: teamSettingsId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const teamSettingsResponse: MobileTeamSettings = { version: 2, identity: teamSettingsIdentity,
  settings: { defaultServiceLocation: 'North chapel', defaultCallTime: '07:30:00', defaultRehearsalTime: '07:45:00', notificationPreferences: ['upcomingEvents'], dashboardWidgets: ['setlists', 'events'], updatedAt: '2026-10-22T00:00:00Z' },
  customRoles: [{ id: teamSettingsId(10), teamId: teamSettingsIdentity.teamId, name: 'Coordinator', permissions: ['setlists.manage'], createdAt: null }], fetchedAt: '2026-10-22T01:00:00Z' };
