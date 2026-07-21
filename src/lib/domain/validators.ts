import { z } from "zod";
import { teamRoles } from "@/lib/types";

const noticePriorities = ["normal", "important", "urgent"] as const;
const reminderRecurrences = ["none", "weekly", "monthly"] as const;

export const emailSchema = z.string().trim().email().max(254);

export const teamNameSchema = z.string().trim().min(2).max(80);

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,3}-\d{5}$/, "Use a team code like DM-10001");

export const songInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().min(1).max(160),
  originalKey: z.string().trim().min(1).max(3),
  bpm: z.preprocess((val) => (val === "" || val === undefined || val === null ? null : Number(val)), z.number().int().min(40).max(240).nullable().optional()),
  timeSignature: z.string().trim().regex(/^\d{1,2}\/\d{1,2}$/),
  lyrics: z.string().trim().min(1).max(20000),
  youtubeUrl: z.string().trim().max(500).optional(),
  spotifyUrl: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  album: z.string().trim().max(160).optional(),
});

const optionalUuidSchema = z
  .union([z.string().trim().uuid(), z.literal("")])
  .optional()
  .transform((value) => (value ? value : undefined));

export const danceChartInputSchema = z.object({
  title: z.string().trim().min(1, "Chart title is required").max(160),
  songId: optionalUuidSchema,
  eventId: optionalUuidSchema,
  choreographyNotes: z.string().trim().min(1, "Dance or tambourine steps are required").max(6000),
  formationNotes: z.string().trim().max(3000).optional(),
  outfitNotes: z.string().trim().max(2000).optional(),
  songTitle: z.string().trim().max(160).optional(),
  songArtist: z.string().trim().max(160).optional(),
  songVersion: z.string().trim().max(160).optional(),
  videoUrl: z.union([z.string().trim().url("Must be a valid video URL"), z.literal("")]).optional(),
});

export const attendanceSchema = z.object({
  eventId: z.string().uuid().or(z.string().min(1)),
  status: z.enum(["available", "maybe", "unavailable"]),
});

export const memberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(teamRoles),
});

export const messageSchema = z.object({
  channelId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
  attachmentFileId: z.string().uuid().optional(),
});

export const setlistInputSchema = z.object({
  title: z.string().trim().min(1, "Setlist title is required").max(160),
  serviceDate: z.string().trim().min(1, "Service date is required"),
  eventType: z.enum(["service", "rehearsal", "meeting", "special_event", "service_rehearsal"]).default("service"),
  serviceType: z.string().trim().max(80).optional(),
  location: z.string().trim().min(1, "Location is required").max(160),
  callTime: z.string().trim().min(1, "Call time is required"),
  rehearsalTime: z.string().trim().min(1, "Rehearsal time is required"),
  worshipLeader: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  eventId: z.string().trim().optional(),
 }).superRefine((value, context) => {
  const requiresServiceType = value.eventType === "service" || value.eventType === "service_rehearsal";

  if (requiresServiceType && !value.serviceType?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["serviceType"],
      message: "Service type is required for service-based setlists.",
    });
  }
 });

export const serviceTemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(160),
  serviceType: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(160),
  callTime: z.string().trim().min(1),
  rehearsalTime: z.string().trim().min(1),
  reminderFrequency: z.enum(reminderRecurrences).default("weekly"),
  reminderOccurrences: z.coerce.number().int().min(1).max(12).default(4),
  worshipLeader: z.string().trim().max(160).optional(),
  acousticGuitar: z.string().trim().max(160).optional(),
  electricGuitar: z.string().trim().max(160).optional(),
  bass: z.string().trim().max(160).optional(),
  drums: z.string().trim().max(160).optional(),
  mainKeys: z.string().trim().max(160).optional(),
  secondKeys: z.string().trim().max(160).optional(),
  extraBandMembers: z.array(z.string().trim()).optional(),
  backupSingers: z.array(z.string().trim()).optional(),
  media: z.string().trim().max(160).optional(),
  dancers: z.array(z.string().trim()).optional(),
});

export const setlistSongInputSchema = z.object({
  setlistId: z.string().min(1),
  songId: z.string().min(1),
  assignedKey: z.string().trim().min(1).max(3),
  bpm: z.preprocess((val) => (val === "" || val === undefined || val === null ? null : Number(val)), z.number().int().min(40).max(240).nullable().optional()),
  lead: z.string().trim().max(160).optional(),
  youtubeUrl: z.string().trim().max(500).optional(),
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, "Event title is required").max(160),
  eventType: z.enum(["service", "rehearsal", "meeting", "special_event", "service_rehearsal"]),
  date: z.string().trim().min(1, "Date is required"),
  startTime: z.string().trim().min(1, "Start time is required"),
  endTime: z.string().trim().optional(),
  rehearsalStartTime: z.string().trim().optional(),
  rehearsalEndTime: z.string().trim().optional(),
  rehearsalDate: z.string().trim().optional(),
  location: z.string().trim().min(1, "Location is required").max(160),
  assignedTeams: z.string().trim().max(500).optional(),
  linkedSetlistId: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  worshipLeader: z.string().trim().min(1, "Worship leader is required").max(160),
  acousticGuitar: z.string().trim().max(160).optional(),
  electricGuitar: z.string().trim().max(160).optional(),
  bass: z.string().trim().max(160).optional(),
  drums: z.string().trim().max(160).optional(),
  mainKeys: z.string().trim().max(160).optional(),
  secondKeys: z.string().trim().max(160).optional(),
  extraBandMembers: z.array(z.string().trim()).optional(),
  backupSingers: z.array(z.string().trim()).optional(),
  media: z.string().trim().max(160).optional(),
  dancers: z.array(z.string().trim()).optional(),
  templateId: z.string().trim().optional(),
});

export const noticeTargetSchema = z
  .object({
    targetType: z.enum(["all", "role", "person"]).default("all"),
    targetRole: z.enum(teamRoles).optional(),
    targetMemberId: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.targetType === "role" && !value.targetRole) {
      context.addIssue({ code: "custom", path: ["targetRole"], message: "Choose a team tag." });
    }

    if (value.targetType === "person" && !value.targetMemberId) {
      context.addIssue({ code: "custom", path: ["targetMemberId"], message: "Choose a person." });
    }
  });

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1, "Announcement title is required").max(160),
  category: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1, "Announcement message is required").max(3000),
  priority: z.enum(noticePriorities).default("normal"),
  eventId: z.string().trim().optional(),
  target: noticeTargetSchema,
});

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1, "Reminder title is required").max(160),
  body: z.string().trim().min(1, "Reminder message is required").max(2000),
  priority: z.enum(noticePriorities).default("normal"),
  eventId: z.string().trim().optional(),
  targetPath: z.string().trim().max(200).optional(),
  scheduledFor: z.string().trim().optional(),
  recurrence: z.enum(reminderRecurrences).default("none"),
  occurrences: z.coerce.number().int().min(1).max(12).default(1),
  target: noticeTargetSchema,
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(teamRoles),
  message: z.string().trim().max(1000).optional(),
});

export const profileInputSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(160),
  primaryRole: z.string().trim().min(1, "Primary role is required").max(160),
  avatarUrl: z.string().trim().nullish().or(z.literal("")),
});

export const feedbackInputSchema = z.object({
  reportType: z.enum(["bug", "improvement"]),
  title: z.string().trim().min(1, "Title is required").max(160),
  description: z.string().trim().max(3000).optional(),
});

export const teamSettingsSchema = z.object({
  teamName: teamNameSchema,
  notificationPreferences: z.array(z.string()).default([]),
  defaultServiceLocation: z.string().trim().min(1).max(160),
  defaultCallTime: z.string().trim().min(1),
  defaultRehearsalTime: z.string().trim().min(1),
});
