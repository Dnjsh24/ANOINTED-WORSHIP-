import { z } from 'zod';
export const MOBILE_SUPPORT_READ_MARKER_MAX_BYTES = 4096;
const timestamp = z.iso.datetime({ offset: true }).refine(value => (value.match(/\.(\d+)/)?.[1].length ?? 0) <= 6, 'Use a PostgreSQL snapshot timestamp with at most six fractional digits.');
// Retain PostgreSQL microseconds rather than rounding a newer reply into the
// displayed snapshot's millisecond. Offset spelling itself is not significant.
export function compareSupportReadMarkerTimes(left: string, right: string) {
  const micros = (value: string) => BigInt(Date.parse(value)) * BigInt(1000) + BigInt((value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const a = micros(timestamp.parse(left)); const b = micros(timestamp.parse(right)); return a < b ? -1 : a > b ? 1 : 0;
}
export const mobileSupportReadMarkerRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), requestId: z.uuid(), readUntil: timestamp }).strict();
export type MobileSupportReadMarkerRequest = z.infer<typeof mobileSupportReadMarkerRequestSchema>;
export const mobileSupportReadMarkerResponseSchema = mobileSupportReadMarkerRequestSchema.extend({ observedReadAt: timestamp, fetchedAt: timestamp }).strict()
  .refine(value => compareSupportReadMarkerTimes(value.observedReadAt, value.readUntil) >= 0, 'The observed read marker must confirm the displayed snapshot.');
export type MobileSupportReadMarkerResponse = z.infer<typeof mobileSupportReadMarkerResponseSchema>;
export function assertMobileSupportReadMarkerResponse(userId: string, request: MobileSupportReadMarkerRequest, value: unknown): MobileSupportReadMarkerResponse {
  request = mobileSupportReadMarkerRequestSchema.parse(request); const result = mobileSupportReadMarkerResponseSchema.parse(value);
  if (request.userId !== userId || result.userId !== userId || result.requestId !== request.requestId || result.readUntil !== request.readUntil) throw new Error('The read proof belongs to another account, support thread or displayed snapshot.');
  return result;
}
