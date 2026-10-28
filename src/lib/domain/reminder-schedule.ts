import { z } from 'zod';
import type { ReminderRecurrence } from '../types';

const manilaOffset = 8 * 60 * 60 * 1000;

/** Calendar recurrence is anchored to the original Manila day, independent of host timezone. */
export function buildReminderOccurrences({ recurrence, scheduledFor, occurrences, now = new Date().toISOString() }: {
  recurrence: ReminderRecurrence;
  scheduledFor?: string | null;
  occurrences: number;
  now?: string;
}) {
  z.enum(['none', 'weekly', 'monthly']).parse(recurrence);
  z.number().int().min(1).max(12).parse(occurrences);
  const first = new Date(scheduledFor ? `${z.iso.date().parse(scheduledFor)}T00:00:00+08:00` : z.iso.datetime({ offset: true }).parse(now));
  const total = recurrence === 'none' ? 1 : occurrences;
  return Array.from({ length: total }, (_, index) => {
    let date = new Date(first);
    if (recurrence === 'weekly') date = new Date(first.getTime() + index * 7 * 24 * 60 * 60 * 1000);
    if (recurrence === 'monthly') {
      const local = new Date(first.getTime() + manilaOffset), day = local.getUTCDate();
      local.setUTCDate(1);
      local.setUTCMonth(local.getUTCMonth() + index);
      const last = new Date(local);
      last.setUTCMonth(local.getUTCMonth() + 1, 0);
      local.setUTCDate(Math.min(day, last.getUTCDate()));
      date = new Date(local.getTime() - manilaOffset);
    }
    return { scheduledFor: z.iso.datetime({ offset: true }).parse(date.toISOString()), recurrenceIndex: index, recurrenceTotal: total };
  });
}
