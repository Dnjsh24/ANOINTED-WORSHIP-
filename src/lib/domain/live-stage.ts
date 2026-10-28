import { z } from 'zod';

export const LIVE_STAGE_LEASE_MS = 25_000;
export const LIVE_STAGE_POLL_MS = 2_500;
export const LIVE_STAGE_HEARTBEAT_MS = 8_000;
export const LIVE_STAGE_REQUEST_MAX_BYTES = 32 * 1024;
export const liveStageLayoutSchema = z.array(z.uuid()).min(1).max(200)
  .refine(ids => new Set(ids).size === ids.length, 'Keep distinct ordered song occurrences.');
export const liveStageCursorSchema = z.object({ slotId: z.uuid(), sectionIndex: z.number().int().min(0).max(2047) }).strict();
export type LiveStageCursor = z.infer<typeof liveStageCursorSchema>;
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const layout = { orderedSlotIds: liveStageLayoutSchema };
const lease = { ...layout, sessionId: z.uuid(), sequence };
export const liveStageRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...layout, action: z.literal('read') }).strict(),
  z.object({ ...layout, action: z.literal('claim'), sessionId: z.uuid(), previousSessionId: z.uuid().nullable(), cursor: liveStageCursorSchema }).strict(),
  z.object({ ...lease, action: z.literal('publish'), cursor: liveStageCursorSchema }).strict(),
  z.object({ ...lease, action: z.literal('heartbeat') }).strict(),
  z.object({ ...lease, action: z.literal('release') }).strict(),
]).superRefine((request, context) => {
  if ('cursor' in request && !request.orderedSlotIds.includes(request.cursor.slotId)) context.addIssue({ code: 'custom', message: 'The live cursor must reference a current song occurrence.' });
  if (request.action === 'claim' && request.sessionId === request.previousSessionId) context.addIssue({ code: 'custom', message: 'Explicit restart requires a new live session ID.' });
});
export type LiveStageRequest = z.infer<typeof liveStageRequestSchema>;
export const liveStageStateSchema = z.object({
  sessionId: z.uuid(), publisherMemberId: z.uuid(), sequence: sequence.or(z.literal(0)), orderedSlotIds: liveStageLayoutSchema,
  cursor: liveStageCursorSchema, expiresAt: z.iso.datetime({ offset: true }),
}).strict().refine(state => state.orderedSlotIds.includes(state.cursor.slotId), 'The live state cursor must belong to its ordered layout.');
export type LiveStageState = z.infer<typeof liveStageStateSchema>;
export const liveStageResponseSchema = z.object({
  version: z.literal(1), teamId: z.uuid(), setlistId: z.uuid(), serverNow: z.iso.datetime({ offset: true }),
  fenceSessionId: z.uuid().nullable(), state: liveStageStateSchema.nullable(),
}).strict().superRefine((response, context) => {
  if (response.state && (response.state.sessionId !== response.fenceSessionId || Date.parse(response.state.expiresAt) <= Date.parse(response.serverNow)
    || Date.parse(response.state.expiresAt) - Date.parse(response.serverNow) > LIVE_STAGE_LEASE_MS + 1000)) context.addIssue({ code: 'custom', message: 'A live cursor requires a current bounded lease.' });
});
export type LiveStageResponse = z.infer<typeof liveStageResponseSchema>;
