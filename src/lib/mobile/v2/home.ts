import { z } from "zod";
import type { DashboardContentModel } from "@/lib/dashboard/home-model";
import { mobileWorkspaceSchema } from "./workspaces";

const text = z.string().max(20000);
const icon = z.enum(["activity", "alertCircle", "alertTriangle", "barChart", "calendar", "checkCircle", "clock", "folder", "footprints", "gift", "info", "mapPin", "message", "music", "settings", "sparkles", "user", "users", "monitorPlay", "refresh", "smartphone"]);
const path = z.string().max(500).regex(/^\/(?!\/)[^\\\u0000-\u001f]*$/);
const count = z.number().int().nonnegative().nullable();
export const mobileHomeContentSchema: z.ZodType<DashboardContentModel> = z.object({
  teamName: text.nullable(), firstName: text,
  nextEvent: z.object({ id: z.uuid(), name: text }).strict().nullable(),
  nextSetlist: z.object({
    id: z.uuid(), name: text, date: z.iso.date(), location: text.nullable(), callTime: text.nullable(),
    rehearsalTime: text.nullable(), leader: text.nullable(), eventType: text.nullable(), serviceTimes: z.array(text).max(50),
  }).strict().nullable(),
  nextSetlistTypeLabel: text, nextDateLabel: text,
  setlistSongs: z.array(z.object({ id: z.uuid(), assignedKey: text, song: z.object({ id: z.uuid(), title: text, bpm: z.number().finite().nullable() }).strict() }).strict()).max(200),
  isAdminOrOwner: z.boolean(), upcomingEventsCount: count, pendingRequestsCount: count,
  confirmedThisMonthCount: count, myConfirmedCount: count, totalSetlistsCount: count,
  announcementItems: z.array(z.object({ iconKey: icon, color: text, bg: text, badge: text, badgeColor: text, title: text, body: text }).strict()).max(3),
  reminders: z.array(z.object({ iconKey: icon, title: text, body: text, due: text, dueColor: text, href: path }).strict()).max(3),
  activityLogs: z.array(z.object({
    id: z.uuid(), action: text, targetType: text, createdAt: z.iso.datetime({ offset: true }),
    profile: z.object({ fullName: text }).strict().nullable(), details: z.object({ name: text.optional(), title: text.optional() }).strict(),
  }).strict()).max(5),
  upcomingCelebrations: z.array(z.object({ name: text, type: z.enum(["Birthday", "Team Anniversary"]), date: z.iso.datetime({ offset: true }), daysAway: z.number().int().min(0).max(14) }).strict()),
  quickLinks: z.array(z.object({ href: path, label: text, sub: text, iconKey: icon }).strict()).max(20),
}).strict();
export const mobileHomeResponseSchema = z.object({
  version: z.literal(2), identity: mobileWorkspaceSchema.extend({ userId: z.uuid() }), model: mobileHomeContentSchema,
  asOf: z.iso.datetime({ offset: true }),
}).strict().refine(response => response.model.teamName === response.identity.teamName, "Home must match the selected workspace.");
export type MobileHomeResponse = z.infer<typeof mobileHomeResponseSchema>;
