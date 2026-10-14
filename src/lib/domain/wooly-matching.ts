import type { WoolyHelpTopic } from "./wooly";

const stopWords = new Set("a an the i my me we our you your how do does can could would should please to for of in on at it this that is are be with and or about then want need like use using help tell explain show what where why get".split(" "));
const synonyms: Record<string, string> = {
  adding: "add", insert: "add", put: "add", include: "add", music: "song", tracks: "song", track: "song", songs: "song",
  setlst: "setlist", setlists: "setlist", plan: "setlist", plans: "setlist", services: "service",
  deleting: "delete", remove: "delete", removing: "delete", erase: "delete", trash: "delete",
  creating: "create", making: "create", make: "create", new: "create", starting: "start",
  editing: "edit", change: "edit", changing: "edit", update: "edit", modify: "edit", rename: "edit",
  saving: "save", store: "save", submit: "save", posting: "send", post: "send",
  snog: "song", sogn: "song", sgno: "song", delte: "delete", delet: "delete", creaet: "create", proflie: "profile",
  viewing: "view", read: "view", see: "view", locate: "find", search: "find", searching: "find",
  downloading: "download", charts: "chart",
  bpm: "tempo", calendars: "calendar", schedule: "timeline", events: "event", messages: "message",
  notifcations: "notification", notifications: "notification", members: "member", teammates: "member", people: "member",
  invite: "invite", inviting: "invite", invitations: "invite", sign: "sign", login: "signin",
};
export function woolyWords(value: string): string[] {
  return [...new Set(value.toLowerCase().normalize("NFKD").replace(/set\s+lists?/g, "setlist").replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .map((word) => synonyms[word] ?? word).filter((word) => word && !stopWords.has(word)))];
}
const actions = new Set(["add", "delete", "create", "edit", "save", "send", "find", "view", "join", "approve", "reject", "restore", "pair", "install"]);
const featureWords = new Set(["song", "setlist", "event", "message", "profile", "member", "team", "announcement", "reminder", "dance", "remote", "practice", "stage", "projector", "confidence", "analytics", "settings", "support", "wooly"]);

export function woolyActionCompatible(question: string, topic: WoolyHelpTopic): boolean {
  const primaryActions = woolyWords(topic.title).filter((word) => actions.has(word));
  const requestedActions = woolyWords(question).filter((word) => actions.has(word));
  return !primaryActions.length || !requestedActions.length || primaryActions.some((action) => requestedActions.some((requested) =>
    action === requested || (["create", "add", "save"].includes(action) && ["create", "add", "save"].includes(requested)) || (["edit", "save"].includes(action) && ["edit", "save"].includes(requested))));
}

function similarWord(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;
  // A single insertion, deletion, substitution or adjacent transposition.
  if (left.length === right.length) {
    const mismatches = [...left].flatMap((character, index) => character === right[index] ? [] : [index]);
    return mismatches.length === 1 || (mismatches.length === 2 && mismatches[1] === mismatches[0] + 1 && left[mismatches[0]] === right[mismatches[1]] && left[mismatches[1]] === right[mismatches[0]]);
  }
  const longer = left.length > right.length ? left : right;
  const shorter = left.length > right.length ? right : left;
  return [...longer].some((_, index) => longer.slice(0, index) + longer.slice(index + 1) === shorter);
}
function phraseScore(query: readonly string[], phrase: readonly string[]) {
  if (!query.length || !phrase.length) return 0;
  const requestedActions = query.filter((word) => actions.has(word));
  const phraseActions = phrase.filter((word) => actions.has(word));
  if (requestedActions.length && phraseActions.length && !requestedActions.some((action) => phraseActions.includes(action) || (["create", "add", "save"].includes(action) && phraseActions.some((candidate) => ["create", "add", "save"].includes(candidate))) || (["edit", "save"].includes(action) && phraseActions.some((candidate) => ["edit", "save"].includes(candidate))))) return 0;
  const requestedFeatures = query.filter((word) => featureWords.has(word));
  if (requestedFeatures.length && requestedFeatures.some((feature) => !phrase.includes(feature))) return 0;
  const matched = query.filter((word) => phrase.some((candidate) => similarWord(word, candidate))).length;
  const coverage = matched / query.length;
  if (coverage < 0.65 || matched < Math.min(2, query.length)) return 0;
  return coverage * 0.8 + (matched / Math.max(query.length, phrase.length)) * 0.2;
}

export function rankWoolyTopics(question: string, topics: readonly WoolyHelpTopic[], pagePath: string, confirmed?: WoolyHelpTopic) {
  let words = woolyWords(question);
  const followUp = /\b(it|that|this|them|there|next|also)\b/i.test(question) && !words.some((word) => featureWords.has(word));
  if (words.length === 1 && !(followUp && confirmed) && !featureWords.has(words[0]) && !["signin", "sign", "calendar", "tempo", "timeline"].includes(words[0])) return { ranked: [], followUp: false, words: [] };
  if (followUp && confirmed?.feature) words = [...words, ...woolyWords(confirmed.feature).filter((word) => featureWords.has(word))];
  const ranked = topics.map((topic) => {
    const actionConflict = !woolyActionCompatible(question, topic);
    const phrases = [topic.title, ...(topic.variants ?? [])];
    const score = actionConflict ? 0 : Math.max(...phrases.map((phrase) => phraseScore(words, woolyWords(phrase))));
    // Context may resolve a close tie; it cannot make a weak match confident.
    const context = score > 0 ? (topic.route === pagePath ? 0.015 : 0) + (confirmed?.feature && confirmed.feature === topic.feature ? 0.02 : 0) : 0;
    return { topic, score, context };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score + b.context - a.score - a.context);
  return { ranked, followUp, words };
}
