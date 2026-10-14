"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import type { WoolyTourId } from "@/lib/domain/wooly";
import type { WoolyChatController, WoolyChatMessage } from "./use-wooly-chat";
import { WoolyInstructions } from "./wooly-instructions";

function ChatAnswer({ message, chat, onTour, onEscalate }: { message: WoolyChatMessage; chat: WoolyChatController; onTour: (id: WoolyTourId, step?: string) => void; onEscalate: (text: string) => void }) {
  const finishSpeaking = chat.finishSpeaking;
  const finish = useCallback(() => finishSpeaking(message.id), [finishSpeaking, message.id]);
  const reply = message.reply;
  return <li><p className="wooly-chat-question"><strong>You</strong><span>{message.question}</span></p>{reply && <div className="wooly-chat-reply">
    <strong>Wooly</strong><WoolyInstructions text={reply.text} announcement="Wooly says" instant={chat.speakingId !== message.id} announce={chat.speakingId === message.id} onComplete={finish} />
    {reply.kind === "answer" && !!reply.steps?.length && <details className="wooly-answer-steps"><summary>View steps</summary><ol>{reply.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details>}
    <div className="wooly-actions">
      {reply.kind === "answer" && <>{reply.sources.map((source) => <Link key={source.href} href={source.href}>{source.label}</Link>)}{reply.tour && <button type="button" onClick={() => onTour(reply.tour!.id, reply.tour!.stepId)}>Show me</button>}</>}
      {reply.kind === "clarification" && reply.choices.map((choice) => <button type="button" key={JSON.stringify(choice.value)} disabled={chat.pending} onClick={() => void chat.send(message.question, choice.value)}>{choice.label}</button>)}
      {reply.kind === "unknown" && <button type="button" onClick={() => onEscalate(message.question)}>Ask website support</button>}
      {reply.kind === "unavailable" && <button type="button" disabled={chat.pending} onClick={() => void chat.send(message.question)}>Retry question</button>}
    </div>
  </div>}</li>;
}

export function WoolyChatView({ chat, onTour, onEscalate, demo }: { chat: WoolyChatController; onTour: (id: WoolyTourId, step?: string) => void; onEscalate: (text: string) => void; demo: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [chat.messages.length, chat.pending]);
  return <section aria-label="Chat with Wooly">
    <p>Ask about Sunday Setlist, a song, a setlist, or an event date.</p>
    {demo && <p className="wooly-fallback">Demo: team lookups show sample data. Support submissions require a signed-in account.</p>}
    <ol className="wooly-chat-messages" aria-label="Conversation with Wooly">{chat.messages.map((message) => <ChatAnswer key={message.id} message={message} chat={chat} onTour={onTour} onEscalate={onEscalate} />)}</ol>
    {chat.pending && <p role="status">Wooly is checking…</p>}<div ref={end} />
    {!chat.messages.length && <div className="wooly-actions wooly-suggestions">{["How do I use setlists?", "What is the next event?", "Find song Opening Song"].map((question) => <button type="button" key={question} onClick={() => void chat.send(question)}>{question}</button>)}</div>}
    <form className="wooly-chat-composer" onSubmit={(event) => { event.preventDefault(); void chat.send(chat.draft); }}>
      <label>Your question<textarea value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} maxLength={1000} rows={2} required disabled={chat.pending} placeholder="Ask Wooly…" /></label>
      <button className="wooly-primary" disabled={chat.pending || !chat.draft.trim()}>Send</button>
    </form>
  </section>;
}
