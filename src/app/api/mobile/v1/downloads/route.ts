import { mobileDownloadRequestSchema, mobileDownloadSchema } from "@/lib/mobile/contracts";
import { requireMobileContext, MobileApiError } from "@/lib/server/mobile/context";
import { mobilePreflight, mobileRoute, mobileDatabaseError } from "@/lib/server/mobile/http";
import { readBoundedJson } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export const OPTIONS = mobilePreflight;
export function POST(request: Request) {
  return mobileRoute(request, async () => {
    const { client, identity } = await requireMobileContext(request, true);
    const input = mobileDownloadRequestSchema.parse(await readBoundedJson(request, 4096));
    const result = await client.rpc("mobile_download_page", {
      p_team_id: identity.teamId, p_selection: input.selection,
      p_cursor: input.cursor ?? null, p_manifest_id: input.manifestId ?? null,
    });
    if (result.error) {
      const failure = mobileDatabaseError(result.error.code);
      throw new MobileApiError(result.error.code === "42501" ? 403 : result.error.code === "54000" ? 413 : 409, failure.code, failure.message);
    }
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new MobileApiError(503, "unavailable", "Download is unavailable.");
    return Response.json(mobileDownloadSchema.parse({ ...result.data, version: 1, identity }));
  });
}
