"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listWoolySupportInboxAction, readWoolyThreadAction } from "@/app/wooly-support-actions";
import type { HelpArticle, SupportMessage, SupportRequest, SupportStatus } from "@/lib/domain/wooly-chat";
import { WoolyThread } from "./wooly-thread";
import { WoolyArticleEditor } from "./wooly-article-editor";

export function WoolySupportInbox() {
  const [status, setStatus] = useState<SupportStatus>("open");
  const [page, setPage] = useState(0);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [thread, setThread] = useState<{ request: SupportRequest; messages: SupportMessage[] } | null>(null);
  const [editor, setEditor] = useState<{ key: string; article?: HelpArticle; answer?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const selection = useRef(0);
  const selectedId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const result = await listWoolySupportInboxAction(status, page * 100);
      if (request !== revision.current) return;
      if (result.ok) { setRequests(result.data.requests); setArticles(result.data.articles); setError(""); }
      else {
        if (result.code === "session" || result.code === "support") { selectedId.current = null; selection.current += 1; setRequests([]); setArticles([]); setThread(null); setEditor(null); }
        setError(result.message);
      }
    } catch { if (request === revision.current) setError("The inbox could not load. Please retry."); }
  }, [status, page]);
  const openThread = useCallback(async (id: string, background = false) => {
    const request = ++selection.current;
    selectedId.current = id;
    if (!background) { setLoading(true); setThread(null); }
    try {
      const result = await readWoolyThreadAction(id, true);
      if (request !== selection.current) return;
      if (result.ok) setThread(result.data); else setError(result.message);
    } catch { if (request === selection.current) setError("This conversation could not load. Please retry."); }
    finally { if (request === selection.current) setLoading(false); }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const update = () => { void refresh(); if (selectedId.current) void openThread(selectedId.current, true); };
    const focus = () => { if (document.visibilityState === "visible") update(); };
    const interval = window.setInterval(focus, 30_000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { revision.current += 1; selection.current += 1; window.clearInterval(interval); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh, openThread]);
  return <>
    {error && <p role="alert">{error} <button onClick={() => void refresh()}>Retry inbox</button></p>}
    <div className="wooly-support-layout">
      <aside className="wooly-support-card" aria-label="Support requests">
        <label>Request status<select value={status} onChange={(event) => { setStatus(event.target.value as SupportStatus); setPage(0); }}>{["open", "answered", "closed"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <p>Oldest requests first. Page {page + 1}.</p>
        <ul className="wooly-topic-list">{requests.map((request) => <li key={request.id}><button onClick={() => void openThread(request.id)}>{request.question}<span className="wooly-support-status">{new Date(request.created_at).toLocaleDateString()} · {request.status}</span></button></li>)}</ul>
        {!requests.length && !error && <p>No {status} requests.</p>}
        <div className="wooly-actions"><button disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous requests</button><button disabled={requests.length < 100} onClick={() => setPage((current) => current + 1)}>Next requests</button></div>
      </aside>
      <div className="wooly-support-card">
        {loading && <p role="status">Loading conversation…</p>}
        {thread ? <WoolyThread key={thread.request.id} {...thread} asSupport onChange={async () => { if (selectedId.current === thread.request.id) await openThread(thread.request.id, true); await refresh(); }} onMakeArticle={(answer) => setEditor({ key: crypto.randomUUID(), answer })} /> : !loading && <p>Select a submitted question to reply.</p>}
      </div>
    </div>
    <section aria-label="Reusable help answers" className="wooly-support-card wooly-article-editor">
      <h2>Reusable help answers</h2><button onClick={() => setEditor({ key: crypto.randomUUID() })}>New answer draft</button>
      <ul className="wooly-topic-list">{articles.map((article) => <li key={article.id}><button onClick={() => setEditor({ key: article.id, article })}>{article.title}<span className="wooly-support-status">{article.published ? "Published" : "Draft"} · {article.audience}</span></button></li>)}</ul>
    </section>
    {editor && <WoolyArticleEditor key={editor.key} article={editor.article} answer={editor.answer} onSaved={refresh} />}
  </>;
}
