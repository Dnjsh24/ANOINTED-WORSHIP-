import { z } from 'zod';
export const mobileSupportRequestsQuerySchema = z.object({ offset: z.string().regex(/^(0|[1-9][0-9]{0,6})$/).transform(Number).pipe(z.number().int().min(0).max(1_000_000)).optional().default(0) }).strict();
export const mobileSupportRequestSchema = z.object({ id: z.uuid(), profile_id: z.uuid(), team_id: z.uuid().nullable(), question: z.string().min(1).max(1000),
  details: z.string().max(2000), page_path: z.string().max(250).refine(value => value === '/dance?new=true' || /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(value), 'Use a supported local website path.'), status: z.enum(['open', 'answered', 'closed']),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }), requester_read_at: z.iso.datetime({ offset: true }), support_updated_at: z.iso.datetime({ offset: true }).nullable() }).strict();
export const mobileSupportRequestsSchema = z.object({ version: z.literal(2), userId: z.uuid(), requests: z.array(mobileSupportRequestSchema).max(50),
  offset: z.number().int().min(0).max(1_000_000), fetchedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => value.requests.every(request => request.profile_id === value.userId), 'Only the authenticated account requests may appear.');
export type MobileSupportRequest = z.infer<typeof mobileSupportRequestSchema>;
export type MobileSupportRequests = z.infer<typeof mobileSupportRequestsSchema>;
export function assertMobileSupportRequests(userId: string, offset: number, value: unknown): MobileSupportRequests {
  const result = mobileSupportRequestsSchema.parse(value);
  if (result.userId !== userId || result.offset !== offset) throw new Error('Support requests belong to another account or page.');
  return result;
}
