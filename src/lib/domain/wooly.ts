import type { Permission } from "./rbac";
import { getWoolyPageGuideId, matchesWoolyRoute, woolyPageGuides, type WoolyPageTourId, type WoolyGuideAccess } from "./wooly-page-guides";
import { woolyKnowledge } from "./wooly-knowledge";
import { woolyTaskGuides, type WoolyTaskTourId } from "./wooly-tasks";

export const WOOLY_TOUR_VERSION = 1;
export type WoolyPose = "greeting" | "explaining" | "pointing" | "speaking" | "listening";
export type WoolyTourId = "joining" | "creating" | "essentials" | WoolyPageTourId | WoolyTaskTourId;
export type TutorialStatus = "offered" | "in_progress" | "paused" | "skipped" | "completed";

export interface WoolyAudience {
  userId: string;
  teamId?: string | null;
  hasTeam: boolean;
  canManageMembers: boolean;
  permissions?: readonly Permission[];
  session?: "guest" | "demo" | "account";
  role?: string;
}

export interface WoolyStep {
  id: string;
  route: string;
  target: string;
  title: string;
  body: string;
  pose: WoolyPose;
  permission?: Permission;
  surface?: string;
}

export const woolyTours: Record<WoolyTourId, { title: string; steps: readonly WoolyStep[] }> = {
  ...woolyPageGuides,
  ...woolyTaskGuides,
  joining: {
    title: "Join your team",
    steps: [
      { id: "welcome", route: "/teams", target: "team-choice", title: "Hi, I’m Wooly!", body: "I’ll show you how to join your group. Choose Join a Team if your leader already has a workspace. Choose Create a Team only when setting up a new group. My Next button moves through instructions; you use the page’s own buttons to complete each action.", pose: "greeting" },
      { id: "code", route: "/teams/join", target: "join-code", title: "Enter your team code", body: "Type the code your leader shared into Team Code, then wait for the lookup. For example, use your team’s actual code rather than the placeholder. If No team found appears, check the code with your leader before continuing.", pose: "explaining" },
      { id: "preview", route: "/teams/join", target: "join-preview", title: "Check the team", body: "After a valid code is entered, the preview shows the team name, location, member count, and service time. Check the name and location against your group. If they don’t match, replace the code before requesting access.", pose: "pointing" },
      { id: "role", route: "/teams/join", target: "join-role", title: "Choose your role", body: "Open Choose Your Role and select how you serve, then review the selection. Your leader uses it to understand your request and decide your permissions. Choosing a role here does not approve membership.", pose: "speaking" },
      { id: "request", route: "/teams/join", target: "join-request", title: "Send your request when ready", body: "Check the team preview and your role, then choose Request to Join Team on the page. A successful request opens the waiting page. Your dashboard opens after your leader approves access; contact that leader if you need an update.", pose: "listening" },
    ],
  },
  creating: {
    title: "Create your team",
    steps: [
      { id: "details", route: "/teams/new", target: "create-details", title: "Let’s bring your team together", body: "Enter Ministry / Team Name and Location, then choose Default Service Time, Timezone, and Your Ministry Role. Timezone and service day are displayed but are not saved by this setup flow. Use Continue on the team form to open the invitations step. Wooly’s Next button continues these instructions.", pose: "greeting" },
      { id: "invites", route: "/teams/new", target: "create-invites", title: "Invite your members", body: "On the invitations step, type an email address and choose Add. Check the list and remove incorrect addresses with their trash icons. This list is only a local draft: Create Team does not save it or send invitations. Share your team code after setup. Choose the form’s Continue button to open review.", pose: "explaining" },
      { id: "review", route: "/teams/new", target: "create-review", title: "Review before creating", body: "On Review & Create Workspace, check the team name, location, service time, ministry role, and invitation count. Use the form’s Back button to correct details. Choose Create Team to submit. Success opens Home; an error stays on setup with a message.", pose: "pointing" },
    ],
  },
  essentials: {
    title: "Your Sunday Setlist essentials",
    steps: [
      { id: "welcome", route: "/dashboard", target: "home", title: "Welcome to your team!", body: "Hi, I’m Wooly! I’ll show you where to check your next service, find its songs, respond to attendance, message your team, and update your profile. Choose Next to follow along. Close this guide to pause, or choose Skip to end it.", pose: "greeting" },
      { id: "home", route: "/dashboard", target: "home", title: "Home: your starting point", body: "Check the next service card for the date, call time, location, and leader. Confirm Availability opens its event; Open Setlist opens its songs; Message Team opens conversations. Read Announcements and Reminders for preparation tasks. New teams may have no scheduled service yet.", pose: "explaining" },
      { id: "setlists", route: "/setlists", target: "setlists", title: "Setlists: prepare your songs", body: "Use Search setlists to find your service’s plan, then open its card. Read Song Order from top to bottom and open a song title for its lyrics and chords. If no plan is listed, clear search and filters or ask your leader whether one has been added.", pose: "pointing" },
      { id: "timeline", route: "/events", target: "events", title: "Timeline: know what’s coming", body: "Find your service using Upcoming or Calendar View, then open the event. Check its time, location, and Assigned Roles / Teams. Under Attendance, choose I’m available, Maybe, or I can’t attend and check the saved response. Pending events need approval first.", pose: "speaking" },
      { id: "messages", route: "/messages", target: "messages", title: "Messages: stay connected", body: "Choose a channel or search for a conversation. Check its name, then read recent messages. If you have sending permission, type your reply and choose Send message. On a phone, open the message sidebar to switch conversations.", pose: "speaking" },
      { id: "profile", route: "/profile", target: "profile", title: "Profile: introduce yourself", body: "Update Full Name, Birthday, Team Anniversary, and Ministry Involvement, then choose Save Changes and check the result. Email is read-only; an administrator manages Leadership Role. Phone, Time Zone, Language, and notification changes are not saved to your account yet.", pose: "listening" },
      { id: "finish", route: "/dashboard", target: "home", title: "You’re ready to explore!", body: "For each service: check Timeline, respond to attendance, open the setlist, and practice its songs. Open Wooly on any page, choose Tutorials, then Show me this page for that page’s controls. Use Chat for a specific question or My questions for your submitted support requests.", pose: "greeting" },
    ],
  },
};

export interface TutorialProgress {
  tourId: WoolyTourId;
  version: number;
  status: TutorialStatus;
  nextStep: string;
  updatedAt: string;
}

export interface TutorialCheckpoint {
  tourId: WoolyTourId;
  version: number;
  status: TutorialStatus;
  nextStep: string;
}

export function isWoolyTourId(value: unknown): value is WoolyTourId {
  return typeof value === "string" && Object.hasOwn(woolyTours, value);
}

export function parseTutorialCheckpoint(value: unknown): TutorialCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  if (!("tourId" in value) || !isWoolyTourId(value.tourId)) return null;
  if (!("version" in value) || value.version !== WOOLY_TOUR_VERSION) return null;
  if (!("status" in value) || !["offered", "in_progress", "paused", "skipped", "completed"].includes(String(value.status))) return null;
  if (!("nextStep" in value) || typeof value.nextStep !== "string") return null;
  if (!woolyTours[value.tourId].steps.some((step) => step.id === value.nextStep)) return null;
  const status = value.status;
  if (status !== "offered" && status !== "in_progress" && status !== "paused" && status !== "skipped" && status !== "completed") return null;
  return { tourId: value.tourId, version: WOOLY_TOUR_VERSION, status, nextStep: value.nextStep };
}

export function isTerminalTutorialStatus(status: TutorialStatus): boolean {
  return status === "completed" || status === "skipped";
}

export function canUseWoolyTour(tourId: WoolyTourId, audience: WoolyAudience): boolean {
  if (!Object.hasOwn(woolyTours, tourId)) return false;
  const guide = getWoolyGuide(tourId);
  if (guide) {
    return canUseWoolyAccess(guide.access, audience);
  }
  if (audience.session === "guest") return false;
  return tourId === "essentials" ? audience.hasTeam : !audience.hasTeam;
}

export function hasWoolyPermission(audience: WoolyAudience, permission: Permission): boolean {
  return audience.permissions?.includes(permission) ?? (permission === "members.manage" && audience.canManageMembers);
}

export function getWoolyTourSteps(tourId: WoolyTourId, routeContext: string, audience: WoolyAudience): readonly WoolyStep[] {
  if (!canUseWoolyTour(tourId, audience)) return [];
  const guide = getWoolyGuide(tourId);
  if (!guide) return woolyTours[tourId].steps;
  if (!matchesWoolyRoute(guide.route, routeContext)) return [];
  const steps = guide.steps.filter((step) => !step.permission || hasWoolyPermission(audience, step.permission));
  const routes = steps.map((step) => bindWoolyGuideRoute(step.route, routeContext));
  if (routes.some((route) => route === null)) return [];
  return steps.map((step, index) => ({ ...step, route: routes[index]! }));
}

export interface WoolyHelpTopic {
  id: string;
  title: string;
  keywords: string;
  answer: string;
  route: string;
  tourId: WoolyTourId | null;
  stepId: string | null;
  audience: "everyone" | "before-team" | "team" | "managers";
  steps?: readonly string[];
  variants?: readonly string[];
  feature?: string;
}

export const woolyHelpTopics: readonly WoolyHelpTopic[] = [
  { id: "joining", title: "How do I join a team?", keywords: "code invite join access role", answer: "Open Join a Team, enter your leader’s Team Code, and check the preview’s name and location. Select Choose Your Role, then choose Request to Join Team. Your leader must approve access before your dashboard opens.", route: "/teams/join", tourId: "joining", stepId: "code", audience: "before-team" },
  { id: "creating", title: "How do I create a team?", keywords: "new group workspace invite", answer: "Choose Create a Team, fill in the team details, and use the form’s Continue button. The invitation list is a local draft and is not sent or saved. Continue to review; timezone and service day are not saved by this flow. Check the summary before choosing Create Team.", route: "/teams/new", tourId: "creating", stepId: "details", audience: "before-team" },
  { id: "approval", title: "Why am I waiting for approval?", keywords: "pending rejected denied request waiting leader", answer: "Your joining request is waiting for a team leader’s decision. Check Request Details for the team and role. This page opens your dashboard after approval. If rejected or still waiting, contact the leader who gave you the code.", route: "/pending", tourId: "page-pending", stepId: "step-1", audience: "before-team" },
  { id: "home", title: "Where do I start?", keywords: "home dashboard reminders announcements service", answer: "On Home, check the next service card. Confirm Availability opens the event; Open Setlist opens the songs; Message Team opens conversations. Read Announcements and Reminders for preparation tasks. A new team may have no scheduled service yet.", route: "/dashboard", tourId: "page-home", stepId: "step-1", audience: "team" },
  { id: "setlists", title: "Where are the service songs?", keywords: "setlist songs plan music chords", answer: "Open Setlists, search for your service’s plan, and open its card. Read Song Order from top to bottom; open a song title for lyrics and chords. Clear search and filters if a plan is missing. Editors can use New Setlist to create a plan.", route: "/setlists", tourId: "page-setlists", stepId: "step-1", audience: "team" },
  { id: "timeline", variants: ["How do I find the calendar?"], title: "Where is my schedule?", keywords: "timeline events rehearsal date calendar availability attendance", answer: "Open Timeline and use Upcoming or Calendar View to find your event. Open it to check the schedule and assignments. Under Attendance, choose I’m available, Maybe, or I can’t attend, then check the saved response. A pending event needs approval first.", route: "/events", tourId: "page-events", stepId: "step-1", audience: "team" },
  { id: "messages", title: "How do I keep in touch?", keywords: "chat message channel team communication upload", answer: "Open Messages, search for a conversation or choose a channel, and check its name. Read recent messages before replying. If you have sending permission, type your reply and choose Send message. On phones, open the message sidebar to switch conversations.", route: "/messages", tourId: "page-messages", stepId: "step-1", audience: "team" },
  { id: "profile", title: "How do I update my details?", keywords: "profile name personal photo avatar settings", answer: "Open Profile to update Full Name, Birthday, Team Anniversary, and Ministry Involvement. Choose Save Changes and check the result. Email is read-only; an administrator manages Leadership Role. Phone, Time Zone, Language, and notification changes are not saved to your account yet.", route: "/profile", tourId: "page-profile", stepId: "step-1", audience: "team" },
  { id: "songs", title: "Where is the song library?", keywords: "library chords lyrics music songs charts", answer: "Open Songs and search by title, artist, or tag. Open a song card for its chart, key, and BPM. Filter offers Favorites, All Songs, A-Z, and Most Played. Ask a song editor to add a missing song if you don’t have creation access.", route: "/songs", tourId: "page-songs", stepId: "step-1", audience: "team" },
  { id: "members", title: "How do I manage members?", keywords: "team management roster approve members roles access", answer: "Open Team Management to search Active Team, review joining requests, and share Team Code. Check the person before approving access or changing a role. Member-management permission controls requests and team-code tools. Role changes and removal require an owner or admin account; ownership transfer requires the owner.", route: "/members", tourId: "page-members", stepId: "step-1", audience: "managers" },
  { id: "analytics", title: "Where are team insights?", keywords: "analytics statistics reports activity", answer: "Owners and admins can open Analytics. Set From and To, then Apply. Read Top rotation, Confirmed availability, Song Usage, Attendance Trend and Channel Activity for the selected period. Availability is based on recorded replies, not physical check-ins.", route: "/analytics", tourId: "page-analytics", stepId: "step-1", audience: "managers" },
  { id: "remote", title: "What is Worship Remote?", keywords: "remote windows presenter connect presentation stage", answer: "On the Windows Presenter, choose Pair phone. Enter its six-digit code in Worship Remote and choose Connect to Presenter, or use Scan QR Code. Codes expire after ten minutes and work once. After pairing, remote controls affect that connected presentation.", route: "/worship-remote", tourId: "page-remote", stepId: "step-1", audience: "team" },
];

export function getWoolyHelpTopics(audience: WoolyAudience, query = "", routeContext = ""): readonly WoolyHelpTopic[] {
  const search = query.trim().toLocaleLowerCase();
  const prepared = woolyHelpTopics.filter((topic) => {
    const allowed = (topic.id !== "analytics" || canUseWoolyAccess({ roles: ["owner", "admin"] }, audience)) && audience.session !== "guest" && (topic.audience === "everyone" ||
      (topic.audience === "before-team" && !audience.hasTeam) ||
      (topic.audience === "team" && audience.hasTeam) ||
      (topic.audience === "managers" && audience.hasTeam && audience.canManageMembers));
    return allowed && (!search || `${topic.title} ${topic.keywords} ${topic.answer}`.toLocaleLowerCase().includes(search));
  });
  const pageTopics: WoolyHelpTopic[] = (Object.keys(woolyPageGuides) as WoolyPageTourId[])
    .filter((id) => !woolyPageGuides[id].route.includes("[") && canUseWoolyTour(id, audience))
    .map((id): WoolyHelpTopic => {
      const guide = woolyPageGuides[id];
      const steps = getWoolyTourSteps(id, guide.route, audience);
      return { id, title: `How to use ${guide.title.toLowerCase()}`, keywords: guide.route, answer: steps.map((step) => step.body).join(" "), route: guide.route, tourId: id, stepId: steps[0]?.id ?? null, audience: "everyone" };
    }).filter((topic) => !search || `${topic.title} ${topic.keywords} ${topic.answer}`.toLocaleLowerCase().includes(search));
  const knowledgeTopics: WoolyHelpTopic[] = woolyKnowledge.filter((entry) => canUseWoolyAccess(entry.access, audience)).map((entry): WoolyHelpTopic => ({
    id: entry.id, title: entry.title, keywords: entry.keywords, answer: entry.answer, steps: entry.steps,
    variants: entry.variants, feature: entry.feature,
    route: entry.route.includes("[") ? (matchesWoolyRoute(entry.route, routeContext) ? routeContext : entry.route.split("/[")[0]) : entry.route,
    tourId: entry.tutorial ? `task-${entry.id}` : null, stepId: entry.tutorial ? "intro" : null, audience: "everyone",
  })).filter((topic) => !search || `${topic.title} ${topic.keywords} ${topic.answer} ${topic.variants?.join(" ")}`.toLowerCase().includes(search));
  return [...knowledgeTopics, ...prepared, ...pageTopics];
}
export function canUseWoolyAccess(access: WoolyGuideAccess, audience: WoolyAudience): boolean {
  if (access === "public") return true;
  if (audience.session === "guest") return false;
  if (access === "before-team") return !audience.hasTeam;
  if (access === "team") return audience.hasTeam;
  if (access === "managers") return audience.hasTeam && audience.canManageMembers;
  if ("roles" in access) return audience.hasTeam && access.roles.some((role) => role === audience.role);
  if ("all" in access) return audience.hasTeam && access.all.every((permission) => hasWoolyPermission(audience, permission));
  return audience.hasTeam && access.some((permission) => hasWoolyPermission(audience, permission));
}
export function getWoolyGuide(id: WoolyTourId) {
  return Object.hasOwn(woolyTaskGuides, id) ? woolyTaskGuides[id as WoolyTaskTourId] : Object.hasOwn(woolyPageGuides, id) ? woolyPageGuides[id as WoolyPageTourId] : undefined;
}
export function bindWoolyGuideRoute(pattern: string, currentPath: string): string | null {
  if (!pattern.includes("[")) return pattern;
  if (matchesWoolyRoute(pattern, currentPath)) return currentPath;
  const currentId = getWoolyPageGuideId(currentPath);
  const currentPattern = currentId ? woolyPageGuides[currentId].route.split("/") : [];
  const segments = currentPath.split("/");
  const desired = pattern.split("/");
  if (desired[1] !== segments[1]) return null;
  for (let index = 0; index < desired.length; index += 1) {
    if (!desired[index].startsWith("[")) continue;
    if (!currentPattern[index]?.startsWith("[") || !segments[index]) return null;
    desired[index] = segments[index];
  }
  const bound = desired.join("/");
  return matchesWoolyRoute(pattern, bound) ? bound : null;
}
export { getWoolyPageGuideId, matchesWoolyRoute, woolyPageGuides } from "./wooly-page-guides";
