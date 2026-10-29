import { z } from 'zod';
import { compareSupportReadMarkerTimes } from './support-read-marker';
export const MOBILE_SUPPORT_REQUEST_CLOSE_MAX_BYTES = 8192;
const timestamp = z.iso.datetime({ offset: true }).refine(value => (value.match(/\.(\d+)/)?.[1].length ?? 0) <= 6, 'Use the original PostgreSQL snapshot timestamp.');
export const mobileSupportRequestCloseSnapshotSchema = z.object({ createdAt: timestamp, status: z.enum(['open', 'answered', 'closed']), updatedAt: timestamp, supportUpdatedAt: timestamp.nullable() }).strict();
export type MobileSupportRequestCloseSnapshot = z.infer<typeof mobileSupportRequestCloseSnapshotSchema>;
export const mobileSupportRequestCloseRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), requestId: z.uuid(), requestNonce: z.uuid(),
  base: mobileSupportRequestCloseSnapshotSchema.extend({ status: z.enum(['open', 'answered']) }).strict() }).strict();
export type MobileSupportRequestCloseRequest = z.infer<typeof mobileSupportRequestCloseRequestSchema>;
export const mobileSupportRequestCloseReceiptSchema = z.object({ version: z.literal(2), request: mobileSupportRequestCloseRequestSchema,
  status: z.enum(['applied', 'conflict', 'missing']), current: mobileSupportRequestCloseSnapshotSchema.nullable(), recordedAt: z.iso.datetime({ offset: true }) }).strict().refine(value => {
    if (value.status === 'missing') return value.current === null;
    if (!value.current) return false;
    if (value.status === 'applied') return value.current.status === 'closed' && compareSupportReadMarkerTimes(value.current.createdAt, value.request.base.createdAt) === 0
      && (value.current.supportUpdatedAt === null ? value.request.base.supportUpdatedAt === null : value.request.base.supportUpdatedAt !== null && compareSupportReadMarkerTimes(value.current.supportUpdatedAt, value.request.base.supportUpdatedAt) === 0);
    return value.current.status !== value.request.base.status || compareSupportReadMarkerTimes(value.current.createdAt, value.request.base.createdAt) !== 0
      || compareSupportReadMarkerTimes(value.current.updatedAt, value.request.base.updatedAt) !== 0 || (value.current.supportUpdatedAt === null) !== (value.request.base.supportUpdatedAt === null)
      || value.current.supportUpdatedAt !== null && value.request.base.supportUpdatedAt !== null && compareSupportReadMarkerTimes(value.current.supportUpdatedAt, value.request.base.supportUpdatedAt) !== 0;
  }, 'The close receipt must describe the applied or changed displayed snapshot.');
export type MobileSupportRequestCloseReceipt = z.infer<typeof mobileSupportRequestCloseReceiptSchema>;
export function assertMobileSupportRequestCloseReceipt(userId: string, request: MobileSupportRequestCloseRequest, value: unknown): MobileSupportRequestCloseReceipt {
  request = mobileSupportRequestCloseRequestSchema.parse(request); const result = mobileSupportRequestCloseReceiptSchema.parse(value);
  if (request.userId !== userId || result.request.userId !== userId || JSON.stringify(result.request) !== JSON.stringify(request)) throw new Error('The close receipt belongs to another account or original snapshot.');
  return result;
}
