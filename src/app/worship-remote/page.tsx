import WorshipRemoteClient from "./worship-remote-client";

export default async function WorshipRemotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <WorshipRemoteClient initialError={error === "expired" ? "That pairing link is invalid, used, or expired. Enter the new PIN shown on the PC." : undefined} />;
}
