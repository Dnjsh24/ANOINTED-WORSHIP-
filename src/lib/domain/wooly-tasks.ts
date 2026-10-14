import { woolyKnowledge } from "./wooly-knowledge";
import type { WoolyPageGuide } from "./wooly-page-guides";
import { woolyTaskStepIds } from "./wooly-task-step-ids";

export type WoolyTaskTourId = `task-${string}`;
function prerequisites(access: WoolyPageGuide["access"]) {
  if (access === "public") return "Follow the page's sign-in requirements when requested.";
  if (access === "before-team") return "Sign in with an account that has not joined a team.";
  if (access === "team") return "You need approved team access.";
  if (access === "managers") return "You need team-management access.";
  if ("roles" in access) return `You need the ${access.roles.join(" or ")} team role.`;
  const labels: Readonly<Record<string, string>> = { "setlists.manage": "manage setlists", "songs.create": "create songs", "songs.edit": "edit songs", "songs.delete": "delete songs", "events.manage": "manage events", "events.request": "request events", "events.review": "review events", "members.manage": "manage members", "dance_notes.manage": "manage dance charts", "messages.send": "send messages", "files.upload": "upload files", "attendance.confirm": "confirm attendance" };
  const describe = (permission: string) => labels[permission] ?? "use this team tool";
  if ("all" in access) return `You need permission to ${access.all.map(describe).join(" and ")}.`;
  return `You need permission to ${access.map(describe).join(" or ")}.`;
}

// New tasks have their own IDs. Existing overview steps and version stay intact.
export const woolyTaskGuides: Record<WoolyTaskTourId, WoolyPageGuide> = Object.fromEntries(
  woolyKnowledge.filter((entry) => entry.tutorial).map((entry) => {
    const insideTarget: Readonly<Record<string, string>> = { announcement: "notice-form", reminder: "notice-form", "save-template": "template-form", "template-picker": "template-picker-form", "band-notes": "band-notes-form", arrangement: "arrangement-form", member: "member-drawer", "event-delete": "event-delete-dialog", "song-delete": "song-delete-dialog" };
    const steps = entry.steps.map((body, index) => ({
      id: woolyTaskStepIds[entry.id][index], route: entry.stepRoutes?.[Math.min(index, entry.stepRoutes.length - 1)] ?? entry.route,
      target: entry.stepTargets?.[index] ?? entry.target,
      title: `Step ${index + 1}: ${entry.title.replace(/\?$/, "")}`,
      body, pose: "pointing" as const,
      ...(entry.surface && entry.stepTargets?.[index] === insideTarget[entry.surface] ? { surface: entry.surface } : {}),
    }));
    return [`task-${entry.id}`, {
      title: entry.title.replace(/\?$/, ""), route: entry.route, access: entry.access,
      steps: [{ id: "intro", route: entry.route, target: entry.target, title: "Before you begin",
        body: `${entry.purpose} ${entry.prerequisites ?? prerequisites(entry.access)} Use your own records. You may practice each action or press Next to read ahead. Only the page’s buttons save changes.`,
        pose: "greeting" as const }, ...steps],
    }];
  }),
);
