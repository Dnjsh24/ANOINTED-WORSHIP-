import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { getDesktopBackgroundFile } from "@/lib/desktop/background-media";
import { isDesktopRuntime } from "@/lib/desktop/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rangeFromHeader(range: string | null, size: number) {
  if (!range?.startsWith("bytes=")) return null;
  const [startText, endText] = range.slice(6).split("-", 2);
  const start = Number.parseInt(startText, 10);
  const requestedEnd = endText ? Number.parseInt(endText, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start < 0 || start >= size) return "invalid" as const;
  return { start, end: Math.min(Math.max(start, requestedEnd), size - 1) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDesktopRuntime()) return new Response("Not found", { status: 404 });
  const context = await getRequiredTeamContext();
  const { id } = await params;
  if (!context.teamId || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = getDesktopBackgroundFile(context.teamId, id);
  if (!file) return new Response("Not found", { status: 404 });

  const size = statSync(file.filePath).size;
  const range = rangeFromHeader(request.headers.get("range"), size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const length = end - start + 1;
  const stream = Readable.toWeb(createReadStream(file.filePath, { start, end })) as ReadableStream;
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(length),
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
