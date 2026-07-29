import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { isDesktopRuntime, getDesktopDataDirectory } from "@/lib/desktop/runtime";

const ids = /^[a-zA-Z0-9_-]{1,128}$/;
const filenames = /^[a-zA-Z0-9._-]{1,180}$/;

function contentType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" } as Record<string, string | undefined>)[extension || ""] || "application/octet-stream";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ presentationId: string; file: string }> }) {
  if (!isDesktopRuntime()) return new NextResponse("Not found", { status: 404 });
  const { presentationId, file } = await params;
  if (!ids.test(presentationId) || !filenames.test(file)) return new NextResponse("Not found", { status: 404 });
  const path = join(getDesktopDataDirectory(), "presentation-media", presentationId, file);
  if (!existsSync(path) || !statSync(path).isFile()) return new NextResponse("Not found", { status: 404 });
  const size = statSync(path).size;
  const range = request.headers.get("range");
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start < 0 || end < start || start >= size) return new NextResponse("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${size}` } });
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new NextResponse(body, { status: match ? 206 : 200, headers: { "content-type": contentType(file), "content-length": String(end - start + 1), "accept-ranges": "bytes", "content-range": match ? `bytes ${start}-${end}/${size}` : "", "cache-control": "no-store" } });
}
