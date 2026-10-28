import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '@/lib/supabase/database.types';
import { assertMobileSetlistCommandScope } from '@/lib/mobile/v2/setlist-commands';
import { assertMobileSetlistCreateReview, mobileSetlistCreateReviewRequestSchema, type MobileSetlistCreateReviewRequest } from '@/lib/mobile/v2/setlist-create-review';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { MobileApiError } from '../context';

type CreateReviewDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_read_setlist_create_review: { Args: { p_team_id: string; p_member_id: string; p_request_id: string; p_command: Json }; Returns: Json };
} } };

export async function readMobileSetlistCreateReview(input: { client: SupabaseClient<Database>;
  identity: z.infer<typeof mobileWorkflowIdentitySchema>; request: MobileSetlistCreateReviewRequest }) {
  const request = mobileSetlistCreateReviewRequestSchema.parse(input.request);
  const identity = mobileWorkflowIdentitySchema.parse({ userId: input.identity.userId, teamId: input.identity.teamId, memberId: input.identity.memberId });
  try { assertMobileSetlistCommandScope(request.command, identity.teamId); }
  catch { throw new MobileApiError(400, 'validation', 'This original command belongs to another workspace. Keep its draft.'); }
  const response = await (input.client as SupabaseClient<CreateReviewDatabase>).rpc('mobile_read_setlist_create_review', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_request_id: request.requestId, p_command: request.command as Json,
  });
  if (response.error) {
    const code = response.error.code;
    if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) {
      throw new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Reopen the matching account and team. Saved work is retained.');
    }
    if (code === 'P0002') throw new MobileApiError(409, 'review_unavailable', 'A separate new-setlist draft cannot be verified. Keep the original saved work.');
    if (['40001', '40P01'].includes(code)) throw new MobileApiError(409, 'retry', 'Another change is in progress. Load a fresh review.');
    if (['22023', '22P02', '23514'].includes(code)) throw new MobileApiError(400, 'validation', 'Review the original new-setlist command. Saved work is retained.');
    throw new MobileApiError(503, 'unavailable', 'New-setlist review is unavailable. Saved work is retained.');
  }
  try { return assertMobileSetlistCreateReview(request, identity, response.data); }
  catch { throw new MobileApiError(503, 'unavailable', 'New-setlist review could not be verified. Keep the original saved work.'); }
}
