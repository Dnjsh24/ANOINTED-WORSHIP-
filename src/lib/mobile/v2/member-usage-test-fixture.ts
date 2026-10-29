import type { MobileIdentity } from '../contracts';
import type { MobileMemberUsage } from './member-usage';
export const memberUsageTestId = (n: number) => `96000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const memberUsageIdentity: MobileIdentity = { userId: memberUsageTestId(1), teamId: memberUsageTestId(2), memberId: memberUsageTestId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const memberUsageInput = { start: '2026-10-01', end: '2026-10-07' };
export const memberUsageFixture: Extract<MobileMemberUsage, { kind: 'ready' }> = { version: 2, identity: memberUsageIdentity, ...memberUsageInput, fetchedAt: '2026-10-21T04:00:00Z', kind: 'ready',
  rows: [{ member_id: memberUsageTestId(4), team_id: memberUsageIdentity.teamId, usage_date: '2026-10-01', active_minutes: 15, sessions: 2 }], memberNames: { [memberUsageTestId(4)]: 'Actual member' } };
