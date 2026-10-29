import { z } from 'zod';
import { setlistInputSchema } from '@/lib/domain/validators';
import { jsonEqual } from '../json-equal';
import type { MobileSetlistSnapshot } from './setlist-state';

/** Use the website's form rules. Identity and event/template authority are captured separately. */
export const mobileSetlistFormSchema = setlistInputSchema.strict().superRefine((value, context) => {
  for (const field of ['worshipLeader', 'eventId'] as const) {
    if (value[field] && !z.uuid().safeParse(value[field]).success) {
      context.addIssue({ code: 'custom', path: [field], message: 'Choose a valid downloaded team record.' });
    }
  }
});

export const mobileSetlistDesiredSlotSchema = z.object({
  localId: z.uuid(), sourceSlotId: z.uuid().nullable(), songId: z.uuid(),
  assignedKey: z.string(), notes: z.string().nullable(), bandNotes: z.string().nullable(), arrangement: z.string().nullable(),
  leadMemberId: z.string().nullable(), youtubeUrl: z.string().nullable(), slideSettings: z.json().nullable(),
}).strict();
export type MobileSetlistDesiredSlot = z.infer<typeof mobileSetlistDesiredSlotSchema>;

/** Raw old values may predate today's limits. Editing another field must not rewrite or discard them. */
export function validateSetlistSlotChanges(slot: MobileSetlistDesiredSlot, base: MobileSetlistSnapshot['slots'][number] | undefined, context: z.RefinementCtx, index: number) {
  const checks = [
    ['assignedKey', 'assigned_key', z.string().trim().min(1).max(3)],
    ['notes', 'notes', z.string().max(2000).nullable()],
    ['bandNotes', 'band_notes', z.string().max(4000).nullable()],
    ['arrangement', 'arrangement', z.string().max(4000).nullable()],
    ['leadMemberId', 'lead_member_id', z.uuid().nullable()],
    ['youtubeUrl', 'youtube_url', z.string().max(500).nullable()],
    ['slideSettings', 'slide_settings', z.record(z.string(), z.json())],
  ] as const;
  for (const [field, column, schema] of checks) {
    const value = slot[field];
    // New rows may use SQL defaults for nullable fields; changed slide settings follow the object-only website RPC.
    if ((!base && field === 'slideSettings' && value === null) || (base && jsonEqual(value, base[column]))) continue;
    if (!schema.safeParse(value).success) context.addIssue({ code: 'custom', path: ['value', 'slots', index, field], message: `Review the changed song-slot ${field}. Its original remains in the draft.` });
  }
}
