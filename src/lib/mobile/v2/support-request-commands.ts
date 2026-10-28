import { z } from 'zod';
const trimmed = (max: number, min = 0) => z.string().min(min).max(max).refine(value => value.trim() === value, 'Trim the reviewed text before saving.');
export const MOBILE_SUPPORT_REQUEST_COMMAND_MAX_BYTES = 32768;
export function normalizeSupportRequestPagePath(value: string) { return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(value) && value.length <= 250 ? value : '/'; }
const common = { version: z.literal(2), userId: z.uuid(), requestId: z.uuid() };
export const mobileSupportRequestCommandSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('create'), teamId: z.uuid().nullable(), question: trimmed(1000, 1), details: trimmed(2000), pagePath: z.string().max(250).regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/) }).strict(),
  z.object({ ...common, kind: z.literal('reply'), messageId: z.uuid(), body: trimmed(5000, 1) }).strict(),
]);
export type MobileSupportRequestCommand = z.infer<typeof mobileSupportRequestCommandSchema>;
export const mobileSupportRequestConfirmationSchema = z.object({ version: z.literal(2), intent: mobileSupportRequestCommandSchema, status: z.literal('confirmed'),
  record: z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) }).strict() }).strict()
  .refine(value => value.record.id === (value.intent.kind === 'create' ? value.intent.requestId : value.intent.messageId), 'Confirm the original record ID.');
export type MobileSupportRequestConfirmation = z.infer<typeof mobileSupportRequestConfirmationSchema>;
export function assertMobileSupportRequestConfirmation(userId: string, intent: MobileSupportRequestCommand, value: unknown): MobileSupportRequestConfirmation {
  intent = mobileSupportRequestCommandSchema.parse(intent); const result = mobileSupportRequestConfirmationSchema.parse(value);
  if (intent.userId !== userId || result.intent.userId !== userId || JSON.stringify(intent) !== JSON.stringify(result.intent)) throw new Error('The support confirmation belongs to another account or original intent.');
  return result;
}
