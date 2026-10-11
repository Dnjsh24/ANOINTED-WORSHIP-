"use client";

import { useEffect, useRef, useState } from "react";
import { saveWoolyHelpArticleAction } from "@/app/wooly-support-actions";
import { helpAudiences, type HelpArticle, type HelpAudience } from "@/lib/domain/wooly-chat";
import { woolyPageGuides } from "@/lib/domain/wooly-page-guides";

export function WoolyArticleEditor({ article, answer = "", onSaved }: { article?: HelpArticle; answer?: string; onSaved: () => Promise<void> }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [id] = useState(() => article?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(article?.title ?? "");
  const [keywords, setKeywords] = useState(article?.keywords ?? "");
  const [body, setBody] = useState(article?.answer ?? answer);
  const [audience, setAudience] = useState<HelpAudience>(article?.audience ?? "everyone");
  const [route, setRoute] = useState(article?.route ?? "");
  const [published, setPublished] = useState(article?.published ?? false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const save = async (publish: boolean) => {
    if (pending) return;
    setPending(true); setFeedback(""); setFailed(false);
    try {
      const result = await saveWoolyHelpArticleAction({ id, title, keywords, answer: body, audience, route: route || null, published: publish });
      if (result.ok) { setPublished(publish); setFeedback(publish ? "Answer published for Wooly." : "Draft saved. Wooly cannot use it yet."); await onSaved(); }
      else { setFailed(true); setFeedback(result.message); }
    } catch { setFailed(true); setFeedback("This answer did not save. Your draft is still here; please retry."); }
    finally { setPending(false); }
  };
  return <section className="wooly-article-editor wooly-support-card" aria-label="Reusable answer editor">
    <h2 ref={heading} tabIndex={-1}>{article ? "Edit reusable answer" : "New reusable answer draft"}</h2>
    <p>Remove names, team facts and private information. Only publish general website help.</p>
    <p className="wooly-support-status">{published ? "Published" : "Unpublished draft"}</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      <label>Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Keywords<input required maxLength={500} value={keywords} onChange={(event) => setKeywords(event.target.value)} /></label>
      <label>Answer<textarea required maxLength={4000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <label>Help audience<select value={audience} onChange={(event) => setAudience(event.target.value as HelpAudience)}>{helpAudiences.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Open page<select value={route} onChange={(event) => setRoute(event.target.value)}><option value="">No page link</option>{Object.values(woolyPageGuides).filter((guide) => !guide.route.includes("[")).map((guide) => <option key={guide.route} value={guide.route}>{guide.title}</option>)}</select></label>
      <p>Preview</p><p className="wooly-article-preview">{body || "Your answer appears here."}</p>
      <div className="wooly-actions">
        <button disabled={pending}>{published ? "Save as draft and unpublish" : "Save draft"}</button>
        <button type="button" className="wooly-primary" disabled={pending || !title.trim() || !keywords.trim() || !body.trim()} onClick={() => void save(true)}>Publish</button>
        {published && <button type="button" disabled={pending} onClick={() => void save(false)}>Unpublish</button>}
      </div>
    </form>
    {feedback && <p role={failed ? "alert" : "status"}>{feedback}</p>}
  </section>;
}
