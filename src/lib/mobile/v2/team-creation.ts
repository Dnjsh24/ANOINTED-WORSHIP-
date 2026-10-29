import { z } from 'zod';
export const MOBILE_TEAM_CREATION_MAX_BYTES = 8192;
const trimmed = (min: number, max: number) => z.string().min(min).max(max).refine(value => value.trim() === value, 'Review trimmed text.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
export const mobileTeamCreationRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), requestNonce: z.uuid(),
  value: z.object({ name: trimmed(2, 80), code: z.string().regex(/^[A-Z]{2,3}-\d{5}$/), location: trimmed(1, 160), callTime: time, rehearsalTime: time }).strict() }).strict();
export type MobileTeamCreationRequest = z.infer<typeof mobileTeamCreationRequestSchema>;
export const mobileTeamCreationReceiptSchema = z.object({ version: z.literal(2), request: mobileTeamCreationRequestSchema, status: z.enum(['applied', 'blocked']),
  workspace: z.object({ teamId: z.uuid(), memberId: z.uuid(), channelId: z.uuid(), name: z.string().min(2).max(80), code: z.string().regex(/^[A-Z]{2,3}-\d{5}$/) }).strict().nullable(),
  reason: z.literal('existing_code').nullable(), recordedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => value.status === 'blocked' ? value.workspace === null && value.reason === 'existing_code'
    : value.reason === null && value.workspace !== null && value.workspace.name === value.request.value.name && value.workspace.code === value.request.value.code, 'Confirm the original workspace bootstrap or blocked code.');
export type MobileTeamCreationReceipt = z.infer<typeof mobileTeamCreationReceiptSchema>;
export function assertMobileTeamCreationReceipt(userId: string, request: MobileTeamCreationRequest, value: unknown): MobileTeamCreationReceipt {
  request = mobileTeamCreationRequestSchema.parse(request); const result = mobileTeamCreationReceiptSchema.parse(value);
  if (request.userId !== userId || result.request.userId !== userId || JSON.stringify(result.request) !== JSON.stringify(request)) throw new Error('The team creation receipt belongs to another account or original intent.');
  return result;
}
