import { MOBILE_PROFILE_AVATAR_UPLOAD_MAX_BYTES, mobileProfileAvatarUploadRequestSchema } from '@/lib/mobile/v2/profile-avatar';
import { uploadMobileProfileAvatar } from '@/lib/server/mobile/v2/profile-avatar';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const current = await requireSelectedWorkspace(request, teamId);
    const input = mobileProfileAvatarUploadRequestSchema.parse(await readBoundedJson(request, MOBILE_PROFILE_AVATAR_UPLOAD_MAX_BYTES));
    return Response.json(await uploadMobileProfileAvatar({ ...current, input, signal: request.signal }));
  });
}
