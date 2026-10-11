import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWoolySupport } from "@/lib/server/wooly-context";
import { WoolySupportInbox } from "@/components/wooly/wooly-support-inbox";
import "@/components/wooly/wooly.css";
import "@/components/wooly/wooly-chat.css";

export default async function WoolySupportPage() {
  try { await requireWoolySupport(); } catch { notFound(); }
  return <main className="wooly-support-page">
    <Link href="/dashboard">Back to Sunday Setlist</Link>
    <h1>Wooly website support</h1>
    <p>Only questions submitted to website support appear here. Replies stay private.</p>
    <WoolySupportInbox />
  </main>;
}
