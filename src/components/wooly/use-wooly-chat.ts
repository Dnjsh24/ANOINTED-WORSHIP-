"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { answerWoolyQuestionAction } from "@/app/wooly-chat-actions";
import { browserCalendarDate, type WoolyChoice, type WoolyReply } from "@/lib/domain/wooly-chat";
import type { WoolyAudience } from "@/lib/domain/wooly";

export type WoolyChatMessage = { id: string; question: string; reply?: WoolyReply };
export function woolyIdentity(audience: WoolyAudience | null) {
  return audience ? JSON.stringify([audience.session ?? "account", audience.session === "guest" ? "guest" : audience.userId, audience.teamId ?? audience.hasTeam, audience.canManageMembers, audience.role, audience.hasTeam ? [...(audience.permissions ?? [])].sort() : []]) : "";
}

export function useWoolyChat(audience: WoolyAudience | null, pathname: string, onSessionChanged?: () => void) {
  const identity = woolyIdentity(audience);
  const identityRef = useRef(identity);
  const sessionChanged = useRef(onSessionChanged);
  const generation = useRef(0);
  const [messages, setMessages] = useState<WoolyChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "tutorials" | "questions">("chat");
  const [scope, setScope] = useState(identity);
  const confirmedTopic = useRef<string | undefined>(undefined);
  useLayoutEffect(() => { if (identityRef.current !== identity) confirmedTopic.current = undefined; identityRef.current = identity; sessionChanged.current = onSessionChanged; }, [identity, onSessionChanged]);
  useEffect(() => {
    if (scope !== identity) {
      generation.current += 1;
      confirmedTopic.current = undefined;
      queueMicrotask(() => {
        setScope(identity); setMessages([]); setDraft(""); setPending(false); setSpeakingId(null); setView("chat");
      });
    }
    return () => { generation.current += 1; };
  }, [identity, scope]);

  const send = useCallback(async (question: string, choice?: WoolyChoice) => {
    if (!question.trim() || question.length > 1000 || pending) return;
    const currentScope = identity;
    const request = ++generation.current;
    const id = crypto.randomUUID();
    setDraft(""); setPending(true); setSpeakingId(null);
    setMessages((current) => [...current.slice(-39), { id, question }]);
    let reply: WoolyReply;
    try { reply = await answerWoolyQuestionAction({ question, pagePath: pathname, today: browserCalendarDate(), ...(confirmedTopic.current ? { confirmedTopicId: confirmedTopic.current } : {}), ...(choice ? { choice } : {}) }); }
    catch { reply = { kind: "unavailable", text: "I couldn’t answer just now. Please try again; the website is still available." }; }
    if (identityRef.current !== currentScope || generation.current !== request) return;
    if (reply.audience && woolyIdentity(reply.audience) !== currentScope) {
      confirmedTopic.current = undefined;
      setMessages([]); setDraft(""); setPending(false); sessionChanged.current?.(); return;
    }
    if (reply.kind === "answer") confirmedTopic.current = reply.confirmedTopicId;
    setMessages((current) => current.map((message) => message.id === id ? { ...message, reply } : message));
    setSpeakingId(id); setPending(false);
  }, [identity, pathname, pending]);
  const finishSpeaking = useCallback((id: string) => setSpeakingId((current) => current === id ? null : current), []);
  return { messages: scope === identity ? messages : [], draft: scope === identity ? draft : "", setDraft, pending: scope === identity && pending, speakingId: scope === identity ? speakingId : null, send, finishSpeaking, view, setView };
}
export type WoolyChatController = ReturnType<typeof useWoolyChat>;
