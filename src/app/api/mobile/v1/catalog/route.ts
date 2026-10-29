import { mobileCatalogRequestSchema } from "@/lib/mobile/catalog-contracts";
import { readMobileCatalog } from "@/lib/server/mobile/catalog";
import { requireMobileContext } from "@/lib/server/mobile/context";
import { mobilePreflight, mobileRoute } from "@/lib/server/mobile/http";
import { readBoundedJson } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export const OPTIONS = mobilePreflight;
export function POST(request: Request) {
  return mobileRoute(request, async () => {
    const context = await requireMobileContext(request, true);
    const input = mobileCatalogRequestSchema.parse(await readBoundedJson(request, 4096));
    return Response.json(await readMobileCatalog({ ...context, input }));
  });
}
