import { expect, it } from 'vitest';
import { buildReminderOccurrences } from './reminder-schedule';

it('clamps the original Manila month-end rather than the previous UTC date or previous occurrence', () => {
  expect(buildReminderOccurrences({ recurrence: 'monthly', scheduledFor: '2027-01-31', occurrences: 3 }).map(row => row.scheduledFor))
    .toEqual(['2027-01-30T16:00:00.000Z', '2027-02-27T16:00:00.000Z', '2027-03-30T16:00:00.000Z']);
  expect(buildReminderOccurrences({ recurrence: 'monthly', scheduledFor: '2028-01-31', occurrences: 2 })[1].scheduledFor).toBe('2028-02-28T16:00:00.000Z');
});
it('uses exact Manila midnight weekly and keeps immediate schedules anchored to the supplied transaction instant', () => {
  expect(buildReminderOccurrences({ recurrence: 'weekly', scheduledFor: '2026-12-28', occurrences: 2 }))
    .toEqual([{ scheduledFor: '2026-12-27T16:00:00.000Z', recurrenceIndex: 0, recurrenceTotal: 2 }, { scheduledFor: '2027-01-03T16:00:00.000Z', recurrenceIndex: 1, recurrenceTotal: 2 }]);
  expect(buildReminderOccurrences({ recurrence: 'monthly', occurrences: 2, now: '2027-01-31T12:03:04.123+08:00' })[1].scheduledFor).toBe('2027-02-28T04:03:04.123Z');
  expect(buildReminderOccurrences({ recurrence: 'none', occurrences: 12, now: '2026-10-22T02:00:00Z' })).toHaveLength(1);
});
it('rejects impossible calendar dates, invalid counts and unrepresentable result dates', () => {
  expect(() => buildReminderOccurrences({ recurrence: 'monthly', scheduledFor: '2027-02-30', occurrences: 2 })).toThrow();
  expect(() => buildReminderOccurrences({ recurrence: 'weekly', occurrences: 13 })).toThrow();
  expect(() => buildReminderOccurrences({ recurrence: 'monthly', scheduledFor: '9999-12-31', occurrences: 2 })).toThrow();
});
