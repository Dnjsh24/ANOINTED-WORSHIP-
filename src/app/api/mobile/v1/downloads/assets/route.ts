import { mobileAssetPageRequestSchema } from "@/lib/mobile/asset-contracts";
import { readMobileAssets } from "@/lib/server/mobile/assets";
import { requireMobileContext } from "@/lib/server/mobile/context";
import { mobilePreflight, mobileRoute } from "@/lib/server/mobile/http";
import { readBoundedJson } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export const OPTIONS = mobilePreflight;
export function POST(request: Request) {
  return mobileRoute(request, async () => {
    const context = await requireMobileContext(request, true);
    const input = mobileAssetPageRequestSchema.parse(await readBoundedJson(request, 4096));
    return Response.json(await readMobileAssets({ ...context, input }));
  });
}
