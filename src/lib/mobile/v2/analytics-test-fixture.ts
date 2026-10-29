import type { MobileIdentity } from '../contracts';
import { parseAnalyticsRange, summarizeAvailability } from '../../domain/analytics';
import { MOBILE_ANALYTICS_TOTALS, type MobileAnalytics } from './analytics';
export const analyticsTestId = (n: number) => `95000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const analyticsIdentity: MobileIdentity = { userId: analyticsTestId(1), teamId: analyticsTestId(2), memberId: analyticsTestId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const analyticsInput = { start: '2026-10-01', end: '2026-10-07' };
export const analyticsFetchedAt = '2026-10-21T04:00:00.000Z';
const range = parseAnalyticsRange(analyticsInput, new Date(analyticsFetchedAt));
export const analyticsFixture: MobileAnalytics = { version: 2, identity: analyticsIdentity, fetchedAt: analyticsFetchedAt, analytics: { mode: 'live', range,
  songs: { status: 'ready', data: [{ id: analyticsTestId(4), title: 'Opening Song', count: 2, previousCount: 1 }] },
  messages: { status: 'ready', data: [{ id: analyticsTestId(5), name: 'Team', count: 3, previousCount: 2 }] },
  availability: { status: 'ready', data: summarizeAvailability([], [], range) }, activity: { status: 'ready', data: [] },
  totals: MOBILE_ANALYTICS_TOTALS.map(item => ({ ...item, value: 0, message: null })) } };
