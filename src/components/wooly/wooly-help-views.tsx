"use client";

import type { ReactNode } from "react";
import type { WoolyAudience, WoolyTourId } from "@/lib/domain/wooly";
import type { WoolyChatController } from "./use-wooly-chat";
import type { WoolyQuestionsController } from "./use-wooly-questions";
import { WoolyChatView } from "./wooly-chat-view";
import { WoolyQuestionsView } from "./wooly-questions-view";

export function WoolyHelpViews({ chat, questions, audience, onTour, children }: { chat: WoolyChatController; questions: WoolyQuestionsController; audience: WoolyAudience; onTour: (id: WoolyTourId, step?: string) => void; children: ReactNode }) {
  return <>
    <nav className="wooly-views" aria-label="Wooly views">{(["chat", "tutorials", "questions"] as const).map((view) => <button type="button" key={view} aria-pressed={chat.view === view} onClick={() => chat.setView(view)}>{view === "questions" ? `My questions${questions.unread ? ` (${questions.unread})` : ""}` : view === "chat" ? "Chat" : "Tutorials"}</button>)}</nav>
    {chat.view === "chat" && <WoolyChatView chat={chat} onTour={onTour} demo={audience.session === "demo"} onEscalate={(text) => { questions.escalate(text); chat.setView("questions"); }} />}
    {chat.view === "tutorials" && children}
    {chat.view === "questions" && <WoolyQuestionsView questions={questions} />}
    {questions.isSupport && <a className="wooly-support-link" href="/support/wooly">Open website support inbox</a>}
  </>;
}
