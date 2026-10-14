"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listMyWoolyRequestsAction, readWoolyThreadAction, submitWoolyRequestAction } from "@/app/wooly-support-actions";
import { type SupportMessage, type SupportRequest } from "@/lib/domain/wooly-chat";
import type { WoolyAudience } from "@/lib/domain/wooly";
import { woolyIdentity } from "./use-wooly-chat";

export function useWoolyQuestions(audience: WoolyAudience | null, visible: boolean, pathname: string, threadVisible = true, onSessionChanged?: () => void) {
  const identity = woolyIdentity(audience);
  const identityRef = useRef(identity);
  const sessionChanged = useRef(onSessionChanged);
  const revision = useRef(0);
  const threadRevision = useRef(0);
  const selectedId = useRef<string | null>(null);
  const draftId = useRef<{ text: string; id: string } | null>(null);
  const [scope, setScope] = useState(identity);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isSupport, setIsSupport] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [thread, setThread] = useState<{ request: SupportRequest; messages: SupportMessage[] } | null>(null);
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [pagePath, setPagePath] = useState(pathname);
  const account = Boolean(audience && audience.session !== "guest" && audience.session !== "demo");
  useLayoutEffect(() => { identityRef.current = identity; sessionChanged.current = onSessionChanged; }, [identity, onSessionChanged]);
  useEffect(() => {
    revision.current += 1;
    threadRevision.current += 1; selectedId.current = null;
    queueMicrotask(() => { setScope(identity); setRequests([]); setUnread(0); setHasMore(false); setIsSupport(false); setError(""); setConfirmation(""); setSaveFailed(false); setPending(false); setThread(null); setQuestion(""); setDetails(""); draftId.current = null; });
    return () => { revision.current += 1; threadRevision.current += 1; };
  }, [identity]);

  const refresh = useCallback(async () => {
    if (!account) return;
    const request = ++revision.current;
    try {
      const result = await listMyWoolyRequestsAction();
      if (identityRef.current !== identity || revision.current !== request) return;
      if ((result.ok && result.data.audience && woolyIdentity(result.data.audience) !== identity) || (!result.ok && result.code === "session")) {
        setScope(""); setRequests([]); setUnread(0); setThread(null); setQuestion(""); setDetails(""); draftId.current = null;
        sessionChanged.current?.(); return;
      }
      if (result.ok) { setRequests(result.data.requests); setUnread(result.data.unread); setHasMore(result.data.requests.length === 50); setIsSupport(result.data.isSupport); setError(""); }
      else setError(result.message);
    } catch { if (identityRef.current === identity && revision.current === request) setError("Website support is unavailable. Please retry."); }
  }, [account, identity]);
  const loadMore = async () => {
    if (!account || pending) return;
    const request = ++revision.current;
    setPending(true);
    try {
      const result = await listMyWoolyRequestsAction(requests.length);
      if (identityRef.current !== identity || revision.current !== request) return;
      if (result.ok) { setRequests((current) => [...current, ...result.data.requests.filter((row) => !current.some((item) => item.id === row.id))]); setHasMore(result.data.requests.length === 50); setUnread(result.data.unread); }
      else setError(result.message);
    } catch { if (identityRef.current === identity) setError("Older questions could not load. Please retry."); }
    finally { if (identityRef.current === identity) setPending(false); }
  };

  const openThread = useCallback(async (id: string, background = false) => {
    if (!account) return;
    const request = ++threadRevision.current;
    selectedId.current = id;
    if (!background) { setPending(true); setThread(null); }
    setError("");
    try {
      const result = await readWoolyThreadAction(id);
      if (identityRef.current !== identity || threadRevision.current !== request) return;
      if (result.ok) { setThread(result.data); setRequests((current) => current.map((item) => item.id === id ? result.data.request : item)); void refresh(); }
      else setError(result.message);
    } catch { if (identityRef.current === identity && threadRevision.current === request) setError("Couldn’t open this question. Please retry."); }
    finally { if (!background && identityRef.current === identity && threadRevision.current === request) setPending(false); }
  }, [account, identity, refresh]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const update = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      if (visible && threadVisible && selectedId.current) void openThread(selectedId.current, true);
    };
    const interval = visible ? window.setInterval(update, 30_000) : null;
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { if (interval !== null) window.clearInterval(interval); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh, openThread, visible, threadVisible]);

  const submit = async () => {
    if (!account || pending || !question.trim()) return;
    const text = JSON.stringify([question.trim(), details.trim(), pagePath]);
    if (draftId.current?.text !== text) draftId.current = { text, id: crypto.randomUUID() };
    const id = draftId.current!.id;
    setPending(true); setError(""); setConfirmation(""); setSaveFailed(false);
    try {
      const result = await submitWoolyRequestAction({ id, question, details, pagePath, expectedProfileId: audience!.userId });
      if (identityRef.current !== identity) return;
      if (!result.ok && result.code === "session") { setScope(""); setQuestion(""); setDetails(""); draftId.current = null; sessionChanged.current?.(); return; }
      if (result.ok) { setQuestion(""); setDetails(""); draftId.current = null; setConfirmation("Your question was sent to website support."); await refresh(); await openThread(result.data); }
      else { setError(result.message); setSaveFailed(true); }
    } catch { if (identityRef.current === identity) { setError("Your question has not been saved. Please retry."); setSaveFailed(true); } }
    finally { if (identityRef.current === identity) setPending(false); }
  };
  const closeThread = () => { threadRevision.current += 1; selectedId.current = null; setThread(null); setConfirmation(""); setPending(false); };
  const escalate = (text: string) => { closeThread(); setQuestion(text); setDetails(""); setPagePath(pathname); setError(""); setSaveFailed(false); };
  const current = scope === identity;
  return { requests: current ? requests : [], unread: current ? unread : 0, hasMore: current && hasMore, loadMore, isSupport: current && isSupport, error: current ? error : "", confirmation: current ? confirmation : "", saveFailed: current && saveFailed, pending: current && pending, thread: current ? thread : null, closeThread, question: current ? question : "", setQuestion, details: current ? details : "", setDetails, pagePath, account, refresh, openThread, submit, escalate };
}
export type WoolyQuestionsController = ReturnType<typeof useWoolyQuestions>;
