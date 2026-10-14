"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { replyWoolyThreadAction, setWoolyRequestStatusAction } from "@/app/wooly-support-actions";
import type { SupportMessage, SupportRequest } from "@/lib/domain/wooly-chat";

export function WoolyThread({ request, messages, asSupport = false, onChange, onMakeArticle }: {
  request: SupportRequest; messages: SupportMessage[]; asSupport?: boolean;
  onChange: () => Promise<void>; onMakeArticle?: (answer: string) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const retry = useRef<{ body: string; id: string } | null>(null);
  const send = async () => {
    if (pending || !body.trim()) return;
    if (retry.current?.body !== body.trim()) retry.current = { body: body.trim(), id: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const result = await replyWoolyThreadAction({ id: retry.current!.id, requestId: request.id, body, asSupport, ...(!asSupport ? { expectedProfileId: request.profile_id } : {}) });
      if (!result.ok) { setError(result.message); return; }
      setBody(""); retry.current = null; await onChange();
    } catch { setError("Your reply has not been saved. Please retry."); }
    finally { setPending(false); }
  };
  const changeStatus = async (status: "open" | "closed") => {
    setPending(true); setError("");
    try {
      const result = await setWoolyRequestStatusAction(request.id, status, asSupport);
      if (result.ok) await onChange(); else setError(result.message);
    } catch { setError("The status did not save. Please retry."); }
    finally { setPending(false); }
  };
  return <section className="wooly-thread" aria-label="Support conversation">
    <h2>{request.question}</h2><p className="wooly-support-status">{request.status} · {new Date(request.created_at).toLocaleDateString()}</p>
    {request.details && <p className="wooly-message-text">{request.details}</p>}
    <Link href={request.page_path}>Page shared with support</Link>
    {messages.length === 200 && <p>Showing the latest 200 replies.</p>}
    <ol className="wooly-chat-messages" aria-label="Support replies" aria-live="polite" aria-relevant="additions">{messages.map((message) => <li key={message.id} className="wooly-chat-reply">
      <strong>{message.author_kind === "support" ? "Website support" : asSupport ? "Requester" : "You"}</strong><p className="wooly-message-text">{message.body}</p>
      {asSupport && message.author_kind === "support" && onMakeArticle && <button type="button" onClick={() => onMakeArticle(message.body)}>Create reusable answer</button>}
    </li>)}</ol>
    {error && <p role="alert" className="wooly-error">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label>Reply<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} required rows={3} disabled={pending} /></label>
      <div className="wooly-actions"><button className="wooly-primary" disabled={pending || !body.trim()}>{pending ? "Saving…" : "Send reply"}</button>
        {request.status !== "closed" ? <button type="button" disabled={pending} onClick={() => void changeStatus("closed")}>Close question</button> : asSupport && <button type="button" disabled={pending} onClick={() => void changeStatus("open")}>Reopen question</button>}
      </div>
    </form>
    {request.status === "closed" && !asSupport && <p>Sending a follow-up will reopen your question.</p>}
  </section>;
}
