import { z } from 'zod';
import { mobileSupportRequestSchema } from './support-requests';
export const mobileSupportMessageSchema = z.object({ id: z.uuid(), request_id: z.uuid(), author_id: z.uuid(), author_kind: z.enum(['requester', 'support']), body: z.string().min(1).max(5000), created_at: z.iso.datetime({ offset: true }) }).strict();
export type MobileSupportMessage = z.infer<typeof mobileSupportMessageSchema>;
export const mobileSupportRequestDetailSchema = z.object({ version: z.literal(2), userId: z.uuid(), requestId: z.uuid(), request: mobileSupportRequestSchema.nullable(),
  messages: z.array(mobileSupportMessageSchema).max(200), offset: z.number().int().min(0).max(1_000_000), hasMore: z.boolean(), fetchedAt: z.iso.datetime({ offset: true }) }).strict()
  .refine(value => value.request === null ? value.messages.length === 0 && !value.hasMore
    : value.request.id === value.requestId && value.request.profile_id === value.userId && value.messages.every(message => message.request_id === value.requestId)
      && (!value.hasMore || value.messages.length === 200), 'The thread must belong to this account and describe a bounded page.');
export type MobileSupportRequestDetail = z.infer<typeof mobileSupportRequestDetailSchema>;
export function assertMobileSupportRequestDetail(userId: string, requestId: string, offset: number, value: unknown): MobileSupportRequestDetail {
  const result = mobileSupportRequestDetailSchema.parse(value);
  if (result.userId !== userId || result.requestId !== requestId || result.offset !== offset) throw new Error('The support thread belongs to another account, request or page.');
  return result;
}
