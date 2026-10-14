"use client";

import type { WoolyQuestionsController } from "./use-wooly-questions";
import { WoolyThread } from "./wooly-thread";

export function WoolyQuestionsView({ questions }: { questions: WoolyQuestionsController }) {
  if (!questions.account) return <section><p>Sign in to submit a question and receive website support replies.</p><a href="/login">Sign in</a></section>;
  if (questions.thread) return <section><button type="button" onClick={questions.closeThread}>Back to my questions</button>
    {questions.confirmation && <p role="status">{questions.confirmation}</p>}
    {questions.error && <p role="alert">{questions.error}</p>}
    <WoolyThread key={questions.thread.request.id} {...questions.thread} onChange={async () => { await questions.openThread(questions.thread!.request.id, true); await questions.refresh(); }} />
  </section>;
  return <section aria-label="My support questions">
    {questions.error && <p className="wooly-error" role="alert">{questions.error} <button type="button" onClick={() => void questions.refresh()}>Retry loading</button></p>}
    <h2>Ask website support</h2><p>Review what you want to send. Only this question, your optional details and the page path are shared.</p>
    <form onSubmit={(event) => { event.preventDefault(); void questions.submit(); }}>
      <label>Question<textarea value={questions.question} onChange={(event) => questions.setQuestion(event.target.value)} maxLength={1000} rows={3} required disabled={questions.pending} /></label>
      <label>Details (optional)<textarea value={questions.details} onChange={(event) => questions.setDetails(event.target.value)} maxLength={2000} rows={2} disabled={questions.pending} /></label>
      <p className="wooly-support-status">Page: {questions.pagePath}</p>
      <div className="wooly-actions"><button className="wooly-primary" disabled={questions.pending || !questions.question.trim()}>{questions.pending ? "Saving…" : questions.saveFailed ? "Retry sending to support" : "Send to support"}</button></div>
    </form>
    <h2>My questions</h2>
    {!questions.requests.length && !questions.error && <p>No submitted questions yet.</p>}
    <div className="wooly-topic-list">{questions.requests.map((request) => <button type="button" key={request.id} disabled={questions.pending} onClick={() => void questions.openThread(request.id)}><span>{request.question}<small className="wooly-support-status">{request.status}{request.support_updated_at && request.support_updated_at > request.requester_read_at ? " · New reply" : ""}</small></span></button>)}</div>
    {questions.hasMore && <button type="button" disabled={questions.pending} onClick={() => void questions.loadMore()}>Load older questions</button>}
  </section>;
}
