import { expect, it } from 'vitest';
import { assertTeamSettingsIdentity, assertMobileTeamSettings, mobileTeamSettingsSchema } from './team-settings';
import { teamSettingsIdentity as identity, teamSettingsResponse as response, teamSettingsId as id } from './team-settings-test-fixture';

it('accepts actual persisted settings or absent settings without fabricated defaults or descriptions', () => {
  expect(assertMobileTeamSettings(identity, response)).toEqual(response);
  const missing = { ...response, settings: null, customRoles: [] };
  expect(assertMobileTeamSettings(identity, missing)).toEqual(missing);
  expect(mobileTeamSettingsSchema.safeParse({ ...response, customRoles: [{ ...response.customRoles[0], description: null }] }).success).toBe(false);
});
it('requires effective member-management or team-management permission and the exact selected authority snapshot', () => {
  for (const permissions of [['members.manage'], ['team.manage']] as const) {
    const permitted = { ...identity, role: 'member', permissions: [...permissions] };
    expect(() => assertTeamSettingsIdentity(permitted, permitted)).not.toThrow();
  }
  for (const changed of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) },
    { ...identity, role: 'owner' }, { ...identity, permissions: ['members.manage', 'songs.create'] as const }, { ...identity, role: 'owner', permissions: [] }]) {
    expect(() => assertMobileTeamSettings(identity, { ...response, identity: { ...changed, permissions: [...changed.permissions] } })).toThrow();
  }
});
it('preserves unknown persisted notification/widget IDs and real PostgreSQL time precision', () => {
  const settings = { ...response.settings!, notificationPreferences: ['futurePreference'], dashboardWidgets: ['customWidget'], defaultCallTime: '24:00:00', defaultRehearsalTime: '08:15:30.123456' };
  expect(assertMobileTeamSettings(identity, { ...response, settings }).settings).toEqual(settings);
  for (const time of ['25:00:00', '08:60:00', '08:00:60', '24:01:00', '24:00:00.000001', '08:00:00+08:00']) expect(mobileTeamSettingsSchema.safeParse({ ...response, settings: { ...settings, defaultCallTime: time } }).success).toBe(false);
});
it('rejects foreign, duplicate, unsorted or unknown-permission catalog rows and oversized data', () => {
  const role = response.customRoles[0];
  for (const customRoles of [[{ ...role, teamId: id(90) }], [role, role], [{ ...role, id: id(11) }, role], [{ ...role, permissions: ['system.superuser'] }],
    [{ ...role, name: 'x'.repeat(161) }], Array.from({ length: 1001 }, (_, index) => ({ ...role, id: id(index + 10) }))]) expect(mobileTeamSettingsSchema.safeParse({ ...response, customRoles }).success).toBe(false);
  expect(mobileTeamSettingsSchema.safeParse({ ...response, settings: { ...response.settings, notificationPreferences: ['x'.repeat(161)] } }).success).toBe(false);
});
