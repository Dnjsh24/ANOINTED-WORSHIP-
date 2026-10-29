import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { mobilePersistedTeamSettingsSchema } from './team-settings';

export const MOBILE_TEAM_SETTINGS_EDIT_MAX_BYTES = 32768;
export const teamSettingsNotificationOptions = ['pendingRequests', 'upcomingEvents', 'unreadMessages', 'attendanceReminders'] as const;
const text = (min: number, max: number) => z.string().min(min).max(max).refine(value => value === value.trim(), 'Use trimmed text.');
export const teamSettingsEditBaseSchema = z.object({ teamName: z.string().min(2).max(80), settings: mobilePersistedTeamSettingsSchema.nullable() }).strict();
export type TeamSettingsEditBase = z.infer<typeof teamSettingsEditBaseSchema>;
export const teamSettingsEditValueSchema = z.object({ teamName: text(2, 80), defaultServiceLocation: text(1, 160),
  defaultCallTime: mobilePersistedTeamSettingsSchema.shape.defaultCallTime, defaultRehearsalTime: mobilePersistedTeamSettingsSchema.shape.defaultRehearsalTime,
  notificationPreferences: z.array(z.string().max(160)).max(100),
}).strict();
const unknownPreferences = (values: string[]) => values.filter(value => !teamSettingsNotificationOptions.some(known => known === value));
export const mobileTeamSettingsEditRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: teamSettingsEditBaseSchema, value: teamSettingsEditValueSchema,
}).strict().refine(request => JSON.stringify(unknownPreferences(request.value.notificationPreferences)) === JSON.stringify(unknownPreferences(request.base.settings?.notificationPreferences ?? [])), 'Retain every unknown saved notification preference unchanged.');
export type MobileTeamSettingsEditRequest = z.infer<typeof mobileTeamSettingsEditRequestSchema>;
export const mobileTeamSettingsEditReceiptSchema = z.object({ version: z.literal(2), request: mobileTeamSettingsEditRequestSchema, status: z.enum(['applied', 'conflict', 'missing']),
  current: teamSettingsEditBaseSchema.extend({ teamId: z.uuid() }).strict(), recordedAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobileTeamSettingsEditReceipt = z.infer<typeof mobileTeamSettingsEditReceiptSchema>;
export function assertTeamSettingsEditScope(identity: MobileIdentity, request: Pick<MobileTeamSettingsEditRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || !identity.permissions.includes('team.manage')) throw new Error('Current matching team-management authority is required.');
}
const seconds = (clock: string) => { const parts = clock.split(':').map(Number); return parts[0] * 3600 + parts[1] * 60 + (parts[2] ?? 0); };
function sameSettings(left: TeamSettingsEditBase, right: TeamSettingsEditBase) {
  if (left.teamName !== right.teamName) return false;
  if (!left.settings || !right.settings) return left.settings === right.settings;
  return left.settings.defaultServiceLocation === right.settings.defaultServiceLocation && seconds(left.settings.defaultCallTime) === seconds(right.settings.defaultCallTime)
    && seconds(left.settings.defaultRehearsalTime) === seconds(right.settings.defaultRehearsalTime) && Date.parse(left.settings.updatedAt) === Date.parse(right.settings.updatedAt)
    && JSON.stringify(left.settings.notificationPreferences) === JSON.stringify(right.settings.notificationPreferences) && JSON.stringify(left.settings.dashboardWidgets) === JSON.stringify(right.settings.dashboardWidgets);
}
export function assertMobileTeamSettingsEditReceipt(identity: MobileIdentity, request: MobileTeamSettingsEditRequest, value: unknown): MobileTeamSettingsEditReceipt {
  request = mobileTeamSettingsEditRequestSchema.parse(request); const result = mobileTeamSettingsEditReceiptSchema.parse(value); assertTeamSettingsEditScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request) || result.current.teamId !== request.teamId) throw new Error('The receipt belongs to another immutable defaults edit.');
  const current = result.current.settings;
  if (result.status === 'missing') { if (current !== null) throw new Error('Missing settings cannot claim saved defaults.'); }
  else if (result.status === 'conflict') { if (!current || sameSettings(request.base, result.current)) throw new Error('A conflict requires changed current settings.'); }
  else if (!current || !request.base.settings || result.current.teamName !== request.value.teamName || current.defaultServiceLocation !== request.value.defaultServiceLocation
    || seconds(current.defaultCallTime) !== seconds(request.value.defaultCallTime) || seconds(current.defaultRehearsalTime) !== seconds(request.value.defaultRehearsalTime)
    || JSON.stringify(current.notificationPreferences) !== JSON.stringify(request.value.notificationPreferences) || JSON.stringify(current.dashboardWidgets) !== JSON.stringify(request.base.settings.dashboardWidgets)) throw new Error('The exact defaults edit and preserved dashboard settings were not confirmed.');
  return result;
}
