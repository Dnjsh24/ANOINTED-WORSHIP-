import type { MobileTeamSettingsEditRequest, MobileTeamSettingsEditReceipt } from './team-settings-edit';
import { teamSettingsIdentity, teamSettingsResponse, teamSettingsId } from './team-settings-test-fixture';
export const teamSettingsEditId = teamSettingsId;
export const teamSettingsEditIdentity = { ...teamSettingsIdentity, permissions: ['team.manage' as const] };
export const teamSettingsEditRequest: MobileTeamSettingsEditRequest = { version: 2, userId: teamSettingsEditIdentity.userId, teamId: teamSettingsEditIdentity.teamId,
  memberId: teamSettingsEditIdentity.memberId, requestNonce: teamSettingsId(50), base: { teamName: teamSettingsEditIdentity.teamName, settings: teamSettingsResponse.settings },
  value: { teamName: 'Renamed team', defaultServiceLocation: 'South chapel', defaultCallTime: '08:30', defaultRehearsalTime: '08:45:30.123456', notificationPreferences: ['upcomingEvents'] } };
export const teamSettingsEditReceipt: MobileTeamSettingsEditReceipt = { version: 2, request: teamSettingsEditRequest, status: 'applied',
  current: { teamId: teamSettingsEditIdentity.teamId, teamName: teamSettingsEditRequest.value.teamName, settings: { ...teamSettingsResponse.settings!, defaultServiceLocation: teamSettingsEditRequest.value.defaultServiceLocation,
    defaultCallTime: teamSettingsEditRequest.value.defaultCallTime, defaultRehearsalTime: teamSettingsEditRequest.value.defaultRehearsalTime, notificationPreferences: teamSettingsEditRequest.value.notificationPreferences,
    updatedAt: '2026-10-22T02:00:00Z' } }, recordedAt: '2026-10-22T02:00:01Z' };
