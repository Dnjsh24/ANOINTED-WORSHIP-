import { redirect } from "next/navigation";

export default async function SetlistPresenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/presenter?setlist=${encodeURIComponent(id)}`);
}
