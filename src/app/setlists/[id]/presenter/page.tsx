import { redirect } from "next/navigation";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getPresenterDestination } from "@/lib/presentation/remote-pairing";

export default async function SetlistPresenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(getPresenterDestination(isDesktopRuntime(), id) || "/worship-remote");
}
