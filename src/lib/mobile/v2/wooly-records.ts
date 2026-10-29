import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { assertTeamNoticesIdentity } from './team-notices';
export const MOBILE_WOOLY_RECORDS_MAX_BYTES = 16384;
const recordChoiceSchema = z.object({ kind: z.literal('record'), id: z.uuid(), intent: z.enum(['find-song', 'song-details', 'find-setlist', 'setlist-songs']) }).strict();
export const mobileWoolyRecordsRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(),
  question: z.string().min(1).max(1000).refine(value => value.trim() === value, 'Trim the question before sending.'), today: z.iso.date(), choice: recordChoiceSchema.optional() }).strict();
export type MobileWoolyRecordsRequest = z.infer<typeof mobileWoolyRecordsRequestSchema>;
const sourceSchema = z.object({ label: z.string().min(1).max(500), href: z.string().regex(/^\/(?:songs|setlists|events)(?:\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$/) }).strict();
export const mobileWoolyRecordsReplySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answer'), text: z.string().min(1).max(40000), sources: z.array(sourceSchema).max(5) }).strict(),
  z.object({ kind: z.literal('clarification'), text: z.string().min(1).max(4000), choices: z.array(z.object({ label: z.string().min(1).max(500), value: recordChoiceSchema }).strict()).max(5) }).strict(),
  z.object({ kind: z.literal('unavailable'), text: z.string().min(1).max(4000) }).strict(),
]);
export type MobileWoolyRecordsReply = z.infer<typeof mobileWoolyRecordsReplySchema>;
export const mobileWoolyRecordsResponseSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, request: mobileWoolyRecordsRequestSchema,
  reply: mobileWoolyRecordsReplySchema, fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export type MobileWoolyRecordsResponse = z.infer<typeof mobileWoolyRecordsResponseSchema>;
export function assertMobileWoolyRecordsResponse(identity: MobileIdentity, request: MobileWoolyRecordsRequest, value: unknown): MobileWoolyRecordsResponse {
  request = mobileWoolyRecordsRequestSchema.parse(request); const result = mobileWoolyRecordsResponseSchema.parse(value);
  assertTeamNoticesIdentity(identity, result.identity);
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || JSON.stringify(result.request) !== JSON.stringify(request)) throw new Error('The live lookup belongs to another account, membership or question.');
  return result;
}
