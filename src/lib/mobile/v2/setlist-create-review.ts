import { z } from 'zod';
import { jsonEqual } from '../json-equal';
import { mobileSetlistCommandSchema } from './setlist-commands';
import { assertMobileSetlistResult, mobileSetlistResultSchema } from './setlist-results';
import { mobileWorkflowIdentitySchema } from './workflow-commands';

export const mobileSetlistCreateReviewRequestSchema = z.object({
  version: z.literal(2), requestId: z.uuid(),
  command: mobileSetlistCommandSchema.refine(command => command.type === 'setlist.save' && command.mode === 'create',
    'Review an original new-setlist command.'),
}).strict();
export type MobileSetlistCreateReviewRequest = z.infer<typeof mobileSetlistCreateReviewRequestSchema>;

export const mobileSetlistCreateReviewResponseSchema = z.object({
  version: z.literal(2), requestId: z.uuid(), identity: mobileWorkflowIdentitySchema,
  receipt: mobileSetlistResultSchema.refine(receipt => (receipt.status === 'conflict' && receipt.remote.snapshot === null) || receipt.status === 'blocked'
    || (receipt.status === 'rejected' && (receipt.code === 'permission' || receipt.code === 'unavailable')),
  'This original receipt cannot be recovered as a separate new draft.'),
  targetAbsent: z.literal(true), checkedAt: z.iso.datetime({ offset: true }),
}).strict();
export type MobileSetlistCreateReviewResponse = z.infer<typeof mobileSetlistCreateReviewResponseSchema>;

/** This read proves absence at the server check, never a reservation or permission to submit another command. */
export function assertMobileSetlistCreateReview(input: MobileSetlistCreateReviewRequest,
  actor: z.infer<typeof mobileWorkflowIdentitySchema>, value: unknown): MobileSetlistCreateReviewResponse {
  const request = mobileSetlistCreateReviewRequestSchema.parse(input);
  const identity = mobileWorkflowIdentitySchema.parse(actor);
  const review = mobileSetlistCreateReviewResponseSchema.parse(value);
  if (review.requestId !== request.requestId || !jsonEqual(review.identity, identity)) {
    throw new Error('The new-setlist review does not match this request and workspace. Keep the original draft.');
  }
  assertMobileSetlistResult(request.command, identity, review.receipt);
  return review;
}
