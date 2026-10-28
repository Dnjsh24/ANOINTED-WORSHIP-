import { mobileBootstrapSchema } from "@/lib/mobile/contracts";
import { requireMobileContext } from "@/lib/server/mobile/context";
import { mobilePreflight, mobileRoute } from "@/lib/server/mobile/http";

export const dynamic = "force-dynamic";
export const OPTIONS = mobilePreflight;
export function GET(request: Request) {
  return mobileRoute(request, async () => {
    const { identity } = await requireMobileContext(request);
    return Response.json(mobileBootstrapSchema.parse({ version: 1, identity, records: [] }));
  });
}
