import { expect, it } from 'vitest';
import { parseAnalyticsRange } from '../../domain/analytics';
import { assertMobileAnalytics, mobileAnalyticsSchema, mobileAnalyticsRequestSchema } from './analytics';
import { analyticsFixture as fixture, analyticsIdentity as identity, analyticsInput as input, analyticsTestId as id } from './analytics-test-fixture';

it('accepts only the exact live website aggregation, including explicit unavailable sources and counts', () => {
  expect(assertMobileAnalytics(identity, input, fixture)).toEqual(fixture);
  expect(assertMobileAnalytics(identity, input, { ...fixture, analytics: { ...fixture.analytics, songs: { status: 'unavailable', message: 'Try again.' },
    totals: fixture.analytics.totals.map(item => ({ ...item, value: null, message: 'Count unavailable.' })) } }).analytics.songs.status).toBe('unavailable');
  expect(mobileAnalyticsSchema.safeParse({ ...fixture, analytics: { ...fixture.analytics, mode: 'demo' } }).success).toBe(false);
});
it('pins owner/admin role and full current selected identity and effective permissions', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, role: 'member' },
    { ...identity, role: 'owner' }, { ...identity, permissions: [] }]) expect(() => assertMobileAnalytics(actor, input, fixture)).toThrow();
  const owner = { ...identity, role: 'owner' }; expect(assertMobileAnalytics(owner, input, { ...fixture, identity: owner }).identity.role).toBe('owner');
});
it('reuses actual Manila default, custom, fallback and future-clamped ranges and rejects a substituted range', () => {
  for (const request of [{}, { start: '2026-10-01', end: '2026-10-30' }, { start: '2025-01-01', end: '2026-10-21' }, { start: '2026-10-08' }]) {
    const range = parseAnalyticsRange(request, new Date(fixture.fetchedAt));
    const value = { ...fixture, analytics: { ...fixture.analytics, range, availability: { status: 'unavailable', message: 'Unavailable.' } } };
    expect(assertMobileAnalytics(identity, request, value).analytics.range).toEqual(range);
  }
  expect(() => assertMobileAnalytics(identity, {}, fixture)).toThrow();
  for (const request of [{ start: '2026-02-30' }, { end: ['2026-01-01'] }, { memberId: identity.memberId }]) expect(mobileAnalyticsRequestSchema.safeParse(request).success).toBe(false);
});
it('rejects malformed nested aggregates, duplicate identifiers and incomplete daily coverage', () => {
  const availability = fixture.analytics.availability;
  if (availability.status !== 'ready') throw new Error('Fixture must contain availability.');
  for (const analytics of [
    { ...fixture.analytics, songs: { status: 'ready', data: [{ id: id(4), title: 'Song', count: -1, previousCount: 0 }] } },
    { ...fixture.analytics, messages: { status: 'ready', data: [{ id: id(5), name: 'Channel', count: 1, previousCount: 0 }, { id: id(5), name: 'Channel', count: 1, previousCount: 0 }] } },
    { ...fixture.analytics, availability: { status: 'ready', data: { ...availability.data, current: { available: 2, total: 1, rate: 100, eventCount: 1 } } } },
    { ...fixture.analytics, availability: { status: 'ready', data: { ...availability.data, daily: availability.data.daily.slice(1) } } },
    { ...fixture.analytics, activity: { status: 'ready', data: [{ id: id(8), createdAt: 'invalid', category: 'song', description: 'Created song', actor: 'Member' }] } },
    { ...fixture.analytics, range: { ...fixture.analytics.range, previousStart: '2026-09-01' } },
  ]) expect(mobileAnalyticsSchema.safeParse({ ...fixture, analytics }).success).toBe(false);
});
it('allows only the eight exact internal website total destinations and explicit missing-count semantics', () => {
  for (const change of [{ href: 'https://attacker.test' }, { href: '//attacker.test' }, { href: '/members?grant=admin' }, { id: 'other' }, { value: null, message: null }, { value: 2, message: 'Unavailable' }]) {
    expect(mobileAnalyticsSchema.safeParse({ ...fixture, analytics: { ...fixture.analytics, totals: fixture.analytics.totals.map((item, index) => index === 0 ? { ...item, ...change } : item) } }).success).toBe(false);
  }
});
