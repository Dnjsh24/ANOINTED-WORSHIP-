import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';

export const MOBILE_TEAM_SETTINGS_ROLE_LIMIT = 1000;
export const MOBILE_TEAM_SETTINGS_PAGE_SIZE = 100;
const timestamp = z.iso.datetime({ offset: true });
const clock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$/);
export const mobilePersistedTeamSettingsSchema = z.object({ defaultServiceLocation: z.string().max(160), defaultCallTime: clock, defaultRehearsalTime: clock,
  notificationPreferences: z.array(z.string().max(160)).max(100), dashboardWidgets: z.array(z.string().max(160)).max(100), updatedAt: timestamp,
}).strict();
export const mobileSettingsCustomRoleSchema = z.object({ id: z.uuid().refine(value => value === value.toLowerCase()), teamId: z.uuid(), name: z.string().max(160),
  permissions: mobileIdentitySchema.shape.permissions, createdAt: timestamp.nullable(),
}).strict();
export const mobileTeamSettingsSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, settings: mobilePersistedTeamSettingsSchema.nullable(),
  customRoles: z.array(mobileSettingsCustomRoleSchema).max(MOBILE_TEAM_SETTINGS_ROLE_LIMIT), fetchedAt: timestamp,
}).strict().refine(value => value.customRoles.every((role, index) => role.teamId === value.identity.teamId && (index === 0 || role.id > value.customRoles[index - 1].id)), 'The complete custom-role catalog requires matching teams and strictly ordered unique IDs.');
export type MobileTeamSettings = z.infer<typeof mobileTeamSettingsSchema>;
export function assertTeamSettingsIdentity(identity: MobileIdentity, actual: MobileIdentity) {
  const allowed = (actor: MobileIdentity) => actor.permissions.includes('members.manage') || actor.permissions.includes('team.manage');
  const permissions = (actor: MobileIdentity) => [...new Set(actor.permissions)].sort().join(',');
  if (!allowed(identity) || !allowed(actual)) throw new Error('Current member-management or team-management permission is required.');
  if (identity.userId !== actual.userId || identity.teamId !== actual.teamId || identity.memberId !== actual.memberId || identity.role !== actual.role
    || permissions(identity) !== permissions(actual)) throw new Error('Reopen the matching account, team and current settings authority.');
}
export function assertMobileTeamSettings(identity: MobileIdentity, value: unknown): MobileTeamSettings {
  const parsed = mobileTeamSettingsSchema.parse(value); assertTeamSettingsIdentity(identity, parsed.identity); return parsed;
}
