import { NextRequest, NextResponse } from "next/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { importTeachingFile } from "@/lib/desktop/pptx-import";

const MAX_TEACHING_FILE_BYTES = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isDesktopRuntime()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const context = await getRequiredTeamContext();
  const setlistId = request.nextUrl.searchParams.get("setlistId") || "";
  const filename = request.nextUrl.searchParams.get("name") || "";
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!context.teamId || !setlistId || !["pdf", "pptx"].includes(extension || "") || filename.length > 240) {
    return NextResponse.json({ error: "Choose a PDF or PowerPoint .pptx file." }, { status: 400 });
  }
  if (!listDesktopSetlists(context.teamId).some((setlist) => setlist.id === setlistId)) {
    return NextResponse.json({ error: "The selected setlist was not found." }, { status: 404 });
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_TEACHING_FILE_BYTES) {
    return NextResponse.json({ error: "Teaching files must be smaller than 500 MB." }, { status: 413 });
  }
  try {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_TEACHING_FILE_BYTES) {
      return NextResponse.json({ error: bytes.byteLength ? "Teaching files must be smaller than 500 MB." : "The selected file is empty." }, { status: 413 });
    }
    const imported = await importTeachingFile(context.teamId, setlistId, filename, bytes);
    return NextResponse.json(imported, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The Teaching file could not be imported.",
    }, { status: 400 });
  }
}
