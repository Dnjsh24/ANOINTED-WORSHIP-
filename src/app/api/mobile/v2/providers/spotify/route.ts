import { requireMobileUser, mobileV2Route, mobileV2Preflight } from '@/lib/server/mobile/v2/context';
import { searchMobileSpotify } from '@/lib/server/mobile/v2/providers';
export const runtime = 'nodejs';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request) {
  return mobileV2Route(request, async () => { await requireMobileUser(request); return searchMobileSpotify(request); });
}
