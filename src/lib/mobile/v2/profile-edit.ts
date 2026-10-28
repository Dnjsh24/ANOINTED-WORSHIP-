import { z } from 'zod';
import type { MobileIdentity } from '../contracts';

export const MOBILE_PROFILE_EDIT_MAX_BYTES = 65536;
const ministries = z.array(z.string().max(160)).max(100);
export const profileEditBaseSchema = z.object({ fullName: z.string().max(160).nullable(), birthday: z.iso.date().nullable(), ministries, teamAnniversary: z.iso.date().nullable() }).strict();
export const profileEditValueSchema = profileEditBaseSchema.extend({ fullName: z.string().min(1).max(160).refine(value => value.trim() === value, 'Trim the full name before saving.') }).strict();
export const mobileProfileEditRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: profileEditBaseSchema, value: profileEditValueSchema }).strict();
export const mobileProfileEditReceiptSchema = z.object({ version: z.literal(2), request: mobileProfileEditRequestSchema, status: z.enum(['applied', 'conflict']),
  current: profileEditBaseSchema, recordedAt: z.iso.datetime({ offset: true }) }).strict();
export type ProfileEditBase = z.infer<typeof profileEditBaseSchema>;
export type ProfileEditValue = z.infer<typeof profileEditValueSchema>;
export type MobileProfileEditRequest = z.infer<typeof mobileProfileEditRequestSchema>;
export type MobileProfileEditReceipt = z.infer<typeof mobileProfileEditReceiptSchema>;
function sameFields(left: ProfileEditBase, right: ProfileEditBase) {
  return left.fullName === right.fullName && left.birthday === right.birthday && left.teamAnniversary === right.teamAnniversary
    && left.ministries.length === right.ministries.length && left.ministries.every((value, index) => value === right.ministries[index]);
}
export function assertProfileEditScope(identity: MobileIdentity, request: MobileProfileEditRequest) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId) throw new Error('Profile edit belongs to another account or selected membership.');
}
export function assertMobileProfileEditReceipt(identity: MobileIdentity, request: MobileProfileEditRequest, value: unknown): MobileProfileEditReceipt {
  request = mobileProfileEditRequestSchema.parse(request); const receipt = mobileProfileEditReceiptSchema.parse(value); assertProfileEditScope(identity, request);
  const echoed = receipt.request; assertProfileEditScope(identity, echoed);
  if (request.requestNonce !== echoed.requestNonce || !sameFields(request.base, echoed.base) || !sameFields(request.value, echoed.value)
    || receipt.status === 'applied' && !sameFields(receipt.current, request.value)
    || receipt.status === 'conflict' && sameFields(receipt.current, request.base)) throw new Error('Matching immutable profile edit receipt required. Keep the saved intent.');
  return receipt;
}
