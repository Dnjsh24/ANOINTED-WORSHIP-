import { z } from 'zod';
export const MOBILE_TEAM_ONBOARDING_MAX_BYTES = 16384;
export const teamOnboardingRoles = ['member', 'worship_leader', 'band_member', 'media', 'dancer', 'pastor'] as const;
export const teamOnboardingCodeSchema = z.string().regex(/^[A-Z]{2,3}-\d{5}$/);
export const mobileTeamOnboardingSnapshotSchema = z.object({ id: z.uuid(), teamId: z.uuid(), userId: z.uuid(), requestedRole: z.enum(teamOnboardingRoles),
  status: z.enum(['pending', 'approved', 'rejected', 'canceled']), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), reviewedAt: z.iso.datetime({ offset: true }).nullable() }).strict();
export type MobileTeamOnboardingSnapshot = z.infer<typeof mobileTeamOnboardingSnapshotSchema>;
export const mobileTeamOnboardingQuerySchema = z.object({ offset: z.string().regex(/^(0|[1-9][0-9]{0,6})$/).transform(Number).pipe(z.number().int().min(0).max(1_000_000)).optional().default(0) }).strict();
export const mobileTeamOnboardingStateSchema = z.object({ version: z.literal(2), userId: z.uuid(), requests: z.array(mobileTeamOnboardingSnapshotSchema).max(50),
  offset: z.number().int().min(0).max(1_000_000), hasMore: z.boolean(), fetchedAt: z.iso.datetime({ offset: true }) }).strict()
  .refine(value => value.requests.every(row => row.userId === value.userId) && (!value.hasMore || value.requests.length === 50), 'Only bounded own-account requests may appear.');
export type MobileTeamOnboardingState = z.infer<typeof mobileTeamOnboardingStateSchema>;
export const mobileTeamOnboardingPreviewRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), code: teamOnboardingCodeSchema }).strict();
export type MobileTeamOnboardingPreviewRequest = z.infer<typeof mobileTeamOnboardingPreviewRequestSchema>;
export const mobileTeamOnboardingPreviewSchema = mobileTeamOnboardingPreviewRequestSchema.extend({ team: z.object({ id: z.uuid(), name: z.string().min(1).max(160) }).strict().nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export type MobileTeamOnboardingPreview = z.infer<typeof mobileTeamOnboardingPreviewSchema>;
export const mobileTeamOnboardingCommandSchema = z.discriminatedUnion('kind', [
  z.object({ version: z.literal(2), kind: z.literal('join'), userId: z.uuid(), requestId: z.uuid(), teamId: z.uuid(), code: teamOnboardingCodeSchema, requestedRole: z.enum(teamOnboardingRoles) }).strict(),
  z.object({ version: z.literal(2), kind: z.literal('cancel'), userId: z.uuid(), base: mobileTeamOnboardingSnapshotSchema.extend({ status: z.literal('pending') }).strict() }).strict(),
]).refine(value => value.kind !== 'cancel' || value.base.userId === value.userId, 'Cancel only your own pending request.');
export type MobileTeamOnboardingCommand = z.infer<typeof mobileTeamOnboardingCommandSchema>;
export const mobileTeamOnboardingResultSchema = z.object({ version: z.literal(2), userId: z.uuid(), request: mobileTeamOnboardingCommandSchema,
  status: z.enum(['confirmed', 'conflict', 'missing']), current: mobileTeamOnboardingSnapshotSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => {
  if (value.userId !== value.request.userId) return false;
  if (value.status === 'missing') return value.current === null;
  const current = value.current; if (!current || current.userId !== value.userId) return false;
  const request = value.request;
  if (request.kind === 'join') return current.teamId === request.teamId && (value.status !== 'confirmed' || current.id === request.requestId && current.requestedRole === request.requestedRole);
  return current.id === request.base.id && current.teamId === request.base.teamId && (value.status !== 'confirmed' || current.status === 'canceled'
    && current.requestedRole === request.base.requestedRole && current.createdAt === request.base.createdAt && current.reviewedAt === null);
}, 'The result must describe the original account/team request.');
export type MobileTeamOnboardingResult = z.infer<typeof mobileTeamOnboardingResultSchema>;
export function assertMobileTeamOnboardingState(userId: string, offset: number, value: unknown): MobileTeamOnboardingState {
  const result = mobileTeamOnboardingStateSchema.parse(value); if (result.userId !== userId || result.offset !== offset) throw new Error('The onboarding page belongs to another account or offset.'); return result;
}
export function assertMobileTeamOnboardingPreview(userId: string, code: string, value: unknown): MobileTeamOnboardingPreview {
  const result = mobileTeamOnboardingPreviewSchema.parse(value); if (result.userId !== userId || result.code !== code) throw new Error('The preview belongs to another account or code.'); return result;
}
export function assertMobileTeamOnboardingResult(userId: string, command: MobileTeamOnboardingCommand, value: unknown): MobileTeamOnboardingResult {
  command = mobileTeamOnboardingCommandSchema.parse(command); const result = mobileTeamOnboardingResultSchema.parse(value);
  if (command.userId !== userId || result.userId !== userId || JSON.stringify(result.request) !== JSON.stringify(command)) throw new Error('Retry the exact original account-owned join or cancellation.'); return result;
}
