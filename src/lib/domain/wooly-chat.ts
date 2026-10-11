import { z } from "zod";
import { canUseWoolyTour, getWoolyHelpTopics, getWoolyPageGuideId, type WoolyAudience, type WoolyHelpTopic, type WoolyTourId } from "./wooly";
import { rankWoolyTopics, woolyWords } from "./wooly-matching";

export const unknownWoolyAnswer = "I don’t know this yet. Would you like to send your question to website support?";
export const woolyRecordIntents = ["next-event", "events-date", "find-setlist", "setlist-songs", "find-song", "song-details"] as const;
export type WoolyRecordIntent = typeof woolyRecordIntents[number];
export const helpAudiences = ["everyone", "before-team", "team", "managers"] as const;
export type HelpAudience = typeof helpAudiences[number];
export type SupportStatus = "open" | "answered" | "closed";

const dateSchema = z.iso.date();
export const woolyQuestionSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  pagePath: z.string().max(250).default("/"),
  today: dateSchema,
  confirmedTopicId: z.string().max(100).optional(),
  choice: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("topic"), id: z.string().max(100) }),
    z.object({ kind: z.literal("record"), id: z.uuid(), intent: z.enum(["find-setlist", "setlist-songs", "find-song", "song-details"]) }),
  ]).optional(),
});
export type WoolyQuestion = z.infer<typeof woolyQuestionSchema>;
export type WoolyChoice = NonNullable<WoolyQuestion["choice"]>;
export type WoolySource = { label: string; href: string };
export type WoolyReply = (
  | { kind: "answer"; text: string; sources: WoolySource[]; steps?: readonly string[]; confirmedTopicId?: string; tour?: { id: WoolyTourId; stepId?: string } }
  | { kind: "clarification"; text: string; choices: { label: string; value: WoolyChoice }[] }
  | { kind: "unknown"; text: string }
  | { kind: "unavailable"; text: string }) & { audience?: WoolyAudience };
export type RecordQuestion = { intent: WoolyRecordIntent; term: string; date?: string; id?: string };

export type SupportRequest = {
  id: string; profile_id: string; team_id: string | null; question: string; details: string;
  page_path: string; status: SupportStatus; created_at: string; updated_at: string;
  requester_read_at: string; support_updated_at: string | null;
};
export type SupportMessage = { id: string; request_id: string; author_id: string; author_kind: "requester" | "support"; body: string; created_at: string };
export type HelpArticle = { id: string; title: string; keywords: string; answer: string; audience: HelpAudience; route: string | null; published: boolean; created_by: string; updated_at: string };
export type WoolyActionResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: "session" | "support" | "rate-limit" };

export const supportRequestSchema = z.object({ id: z.uuid(), question: z.string().trim().min(1).max(1000), details: z.string().trim().max(2000), pagePath: z.string().max(250), expectedProfileId: z.uuid().optional() });
export const supportReplySchema = z.object({ id: z.uuid(), requestId: z.uuid(), body: z.string().trim().min(1).max(5000), asSupport: z.boolean().default(false), expectedProfileId: z.uuid().optional() });
export const helpArticleSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(120), keywords: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(4000), audience: z.enum(helpAudiences), route: z.string().max(150).nullable(), published: z.boolean() });

export function safeWoolyPagePath(value: string): string {
  if (value === "/dance?new=true") return value;
  return /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(value) ? value : "/";
}

export function normalizeWoolyQuestion(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\b(setlist|set list)s?\b/g, "setlist").replace(/\bsongs\b/g, "song").replace(/\bevents\b/g, "event")
    .replace(/\b(tempos|tempo)\b/g, "bpm").replace(/\s+/g, " ").trim();
}

function recordTerm(question: string, prefix: RegExp) {
  const quoted = question.match(/["“]([^"”]+)["”]/)?.[1];
  return (quoted ?? question.replace(prefix, "").replace(/^(?:called|named)\s+/i, "")).replace(/[?!.]+$/g, "").replace(/\s+please$/i, "").trim();
}

export function matchRecordQuestion(input: WoolyQuestion): RecordQuestion | null {
  const text = normalizeWoolyQuestion(input.question);
  const selected = input.choice?.kind === "record" ? input.choice : null;
  if (selected) return { intent: selected.intent, term: "", id: selected.id };
  if (/^(?:please\s+)?(?:do not|dont|never|cannot|cant|without)\b/.test(text)) return null;
  // An explicit record prefix owns the remainder, including words such as
  // "How" or "Save" in a real song title.
  if (/^(find|search|look for|open|show)( me)?( the| a)? setlist\b/.test(text)) return { intent: "find-setlist", term: recordTerm(input.question, /^(?:find|search|look for|open|show)(?: me)?(?: the| a)?\s*setlists?\s*/i) };
  if (/^(find|search|look for|open|show)( me)?( the| a)? song\b/.test(text)) return { intent: "find-song", term: recordTerm(input.question, /^(?:find|search|look for|open|show)(?: me)?(?: the| a)?\s*songs?\s*/i) };
  if (/^(?:what (?:is|are) (?:the )?)?(?:key|bpm)(?:\s*(?:and|&)\s*(?:key|bpm))*\s+(?:of|for)\b/.test(text)) return { intent: "song-details", term: recordTerm(input.question, /^.*?\b(?:key|bpm|tempo)(?:\s*(?:and|&|\/)\s*(?:key|bpm|tempo))*\s*(?:of|for)\s*(?:the song\s+)?/i) };
  if (/\b(how|meaning|mean|explain|definition|create|add|edit|delete|remove|save)\b|\b(?:can|where|why) (?:i|we)\b/.test(text)) return null;
  if (/\b(next|upcoming)\b.*\b(event|service|rehearsal)\b/.test(text)) return { intent: "next-event", term: "", date: input.today };
  if (/\b(event|schedule|service|rehearsal)\b/.test(text) && /\b(on|today|tomorrow)\b/.test(text)) {
    const explicit = input.question.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const tomorrow = new Date(`${input.today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = explicit ?? (/\btomorrow\b/.test(text) ? tomorrow.toISOString().slice(0, 10) : /\btoday\b/.test(text) ? input.today : undefined);
    if (date && dateSchema.safeParse(date).success) return { intent: "events-date", term: "", date };
  }
  if (/\b(key|bpm)\b/.test(text) && /\b(of|for)\b/.test(text) && !/\b(how|change|edit|save|add|delete)\b/.test(text)) return { intent: "song-details", term: recordTerm(input.question, /^.*?\b(?:key|bpm|tempo)(?:\s*(?:and|&|\/)\s*(?:key|bpm|tempo))*\s*(?:of|for|is)?\s*(?:the song\s+)?/i) };
  if (/\b(song|songs)\b.*\b(in|from|on)\b.*\bsetlist\b|\bsetlist\b.*\b(song|track)\b/.test(text)) return { intent: "setlist-songs", term: recordTerm(input.question, /^.*?\b(?:in|from|on)\s*(?:the\s*)?(?:setlists?\s+)?/i).replace(/\s+setlist$/i, "") };
  return null;
}

export function needsWoolyDate(input: WoolyQuestion) {
  const text = normalizeWoolyQuestion(input.question);
  return !input.choice && !/\b(how|can i|meaning|explain)\b/.test(text) && /\b(event|schedule|service|rehearsal)\b/.test(text) &&
    /\b(on|today|tomorrow)\b/.test(text) && !matchRecordQuestion(input);
}

export function articleVisible(article: HelpArticle, audience: WoolyAudience) {
  return article.published && (article.audience === "everyone" ||
    (audience.session !== "guest" && (article.audience === "before-team" ? !audience.hasTeam : article.audience === "team" ? audience.hasTeam : audience.hasTeam && audience.canManageMembers)));
}

export function matchPreparedAnswer(input: WoolyQuestion, audience: WoolyAudience, articles: readonly HelpArticle[] = []): WoolyReply {
  const topics: WoolyHelpTopic[] = [...getWoolyHelpTopics(audience, "", input.pagePath), ...articles.filter((article) => articleVisible(article, audience)).map((article): WoolyHelpTopic => ({
    id: `article:${article.id}`, title: article.title, keywords: article.keywords, answer: article.answer,
    route: article.route ?? input.pagePath, tourId: null, stepId: null, audience: article.audience, variants: [article.keywords],
  }))];
  const text = normalizeWoolyQuestion(input.question);
  if (!input.choice && !/\b(how|why|meaning|explain)\b|\b(?:can|where) (?:i|we)\b/.test(text) && /^(find|show|read|latest|list)\b.*\b(messages?|members?|announcements?|reminders?|email|phone number)\b|\b(?:email|phone number) of\b|\bwhat did .* say\b/.test(text)) return { kind: "unknown", text: unknownWoolyAnswer };
  if (/^(hi|hello|hey|help)$/.test(text) && !input.choice) return { kind: "answer", text: "Hi, I’m Wooly! Ask me how to use Sunday Setlist, find a song or setlist, or check an event date.", sources: [] };
  const selected = input.choice?.kind === "topic" ? topics.find((topic) => topic.id === input.choice?.id) : undefined;
  // Choices and follow-up context are revalidated against the current audience.
  if (input.choice?.kind === "topic" && !selected) return { kind: "unknown", text: unknownWoolyAnswer };
  const confirmedBase = topics.find((topic) => topic.id === input.confirmedTopicId);
  const confirmed = confirmedBase ? { ...confirmedBase, feature: confirmedBase.feature ?? topics.find((topic) => topic.route === confirmedBase.route && topic.feature)?.feature } : undefined;
  // Authored variants can ask about a field's result ("what saves my birthday?")
  // without using the title's verb. Fuzzy matches still enforce action boundaries.
  const exact = topics.filter((topic) => [topic.title, ...(topic.variants ?? [])].some((phrase) => normalizeWoolyQuestion(phrase) === text));
  if (!input.choice && !exact.length && /\b(not|never|dont|doesnt|cant|cannot|without|stop)\b/.test(text)) return { kind: "unknown", text: unknownWoolyAnswer };
  const { ranked, followUp, words } = selected || exact.length === 1 ? { ranked: [], followUp: false, words: [] } : rankWoolyTopics(input.question, topics, input.pagePath, confirmed);
  const matches = ranked.filter((candidate) => candidate.score + candidate.context >= (ranked[0]?.score ?? 0) - 0.055);
  const topic = selected ?? (exact.length === 1 ? exact[0] : !followUp && ranked[0]?.score >= 0.9 && matches.length === 1 ? ranked[0].topic : undefined);
  if (topic) {
    const article = articles.find((item) => topic.id === `article:${item.id}`);
    const guideId = getWoolyPageGuideId(topic.route);
    const linkAllowed = (!article || article.route !== null) && (!guideId || canUseWoolyTour(guideId, audience));
    return { kind: "answer", text: topic.answer, steps: topic.steps, confirmedTopicId: topic.id, sources: linkAllowed ? [{ label: "Open page", href: safeWoolyPagePath(topic.route) }] : [], ...(topic.tourId ? { tour: { id: topic.tourId, ...(topic.stepId ? { stepId: topic.stepId } : {}) } } : {}) };
  }
  let choices = exact.length > 1 ? exact : matches.map(({ topic: match }) => match);
  if (!choices.length && followUp && confirmed) choices = topics.filter((candidate) => confirmed.feature ? candidate.feature === confirmed.feature : candidate.route === confirmed.route);
  if (!choices.length && words.length > 0 && words.length <= 3 && words.every((word) => topics.some((candidate) => woolyWords(candidate.title).includes(word)))) choices = topics.filter((candidate) => words.some((word) => woolyWords(candidate.title).includes(word)));
  if (!input.choice && choices.length) return { kind: "clarification", text: "Which of these would you like help with?", choices: choices.slice(0, 5).map((match) => ({ label: match.title, value: { kind: "topic", id: match.id } })) };
  return { kind: "unknown", text: unknownWoolyAnswer };
}

export function unreadSupportRequests(requests: readonly SupportRequest[]) {
  return requests.filter((request) => request.support_updated_at && request.support_updated_at > request.requester_read_at).length;
}

export function browserCalendarDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
