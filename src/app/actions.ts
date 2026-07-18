"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { can } from "@/lib/domain/rbac";
import { generateTeamCode } from "@/lib/domain/team-code";
import { toPostgresTime } from "@/lib/domain/time";
import { normalizeSetlistServiceTimes } from "@/lib/domain/event-types";
import {
  announcementInputSchema,
  attendanceSchema,
  danceChartInputSchema,
  eventInputSchema,
  feedbackInputSchema,
  inviteMemberSchema,
  joinCodeSchema,
  memberRoleSchema,
  messageSchema,
  profileInputSchema,
  reminderInputSchema,
  setlistInputSchema,
  setlistSongInputSchema,
  serviceTemplateInputSchema,
  songInputSchema,
  teamNameSchema,
  teamSettingsSchema,
} from "@/lib/domain/validators";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/domain/rbac";
import type { ReminderRecurrence, SetlistChangeType, TeamRole } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const joinableTeamRoles = ["member", "worship_leader", "band_member", "media", "dancer", "pastor"] as const;
const profileAvatarUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.pathname.includes("/storage/v1/object/public/profile-avatars/");
    } catch {
      return false;
    }
  }, "Use a profile avatar storage URL.");

function normalizeJoinableRole(value: FormDataEntryValue | null): (typeof joinableTeamRoles)[number] {
  const role = String(value ?? "");
  return joinableTeamRoles.includes(role as (typeof joinableTeamRoles)[number])
    ? (role as (typeof joinableTeamRoles)[number])
    : "member";
}

function ministryLabelForRole(role: string) {
  switch (role) {
    case "band_member":
      return "Band Member";
    case "worship_leader":
      return "Worship Leader";
    case "media":
      return "Media & Tech";
    case "dancer":
      return "Dance Ministry";
    case "pastor":
      return "Pastor";
    case "member":
      return "Singer / Member";
    default:
      return "Member";
  }
}

const authRequiredState: ActionState = {
  ok: false,
  message: "Sign in with Supabase to save changes.",
};

function validationState(error: z.ZodError): ActionState {
  return {
    ok: false,
    message: "Check the highlighted fields and try again.",
    errors: error.flatten().fieldErrors,
  };
}

async function getMutationContext(permission?: Permission, targetTeamId?: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      userId: string;
      teamId: string;
      memberId: string;
      role: TeamRole;
    }
  | { ok: false; state: ActionState }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, state: authRequiredState };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, state: authRequiredState };
  }

  let membershipQuery = supabase
    .from("team_members")
    .select("id, team_id, role, status, teams!inner ( id )")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (targetTeamId) {
    membershipQuery = membershipQuery.eq("team_id", targetTeamId);
  }

  const { data: membership } = await membershipQuery.maybeSingle();

  if (!membership) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "Join or create a team before saving ministry data.",
      },
    };
  }

  const role = membership.role as TeamRole;

  if (permission && !can(role, permission)) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "You do not have permission to perform this action.",
      },
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    teamId: membership.team_id,
    memberId: membership.id,
    role,
  };
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function revalidateAppShell() {
  revalidatePath("/dashboard");
  revalidatePath("/setlists");
  revalidatePath("/events");
  revalidatePath("/messages");
  revalidatePath("/members");
  revalidatePath("/announcements");
  revalidatePath("/reminders");
  revalidatePath("/profile");
  revalidatePath("/admin/settings");
  revalidatePath("/songs");
  revalidatePath("/dance");
}

type MutationContext = Extract<Awaited<ReturnType<typeof getMutationContext>>, { ok: true }>;

type NoticeTargetInput = {
  targetType: "all" | "role" | "person";
  targetRole?: TeamRole;
  targetMemberId?: string;
};

type ResolvedNoticeTarget = {
  targetRole: TeamRole | null;
  targetProfileId: string | null;
  targetLabel: string;
  recipientProfileIds: string[];
};

type NoticeRecipientRow = {
  id: string;
  profile_id: string;
  role: TeamRole;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key).trim();
  return value.length > 0 ? value : undefined;
}

function scheduledDateToIso(value?: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function addMonthsClamped(date: Date, months: number) {
  const copy = new Date(date);
  const day = copy.getDate();
  copy.setMonth(copy.getMonth() + months, 1);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return copy;
}

function buildReminderOccurrences({
  recurrence,
  scheduledFor,
  occurrences,
}: {
  recurrence: ReminderRecurrence;
  scheduledFor?: string;
  occurrences: number;
}) {
  const firstDate = new Date(scheduledDateToIso(scheduledFor));
  const total = recurrence === "none" ? 1 : occurrences;

  return Array.from({ length: total }, (_, index) => {
    const scheduledDate =
      recurrence === "weekly"
        ? new Date(firstDate.getTime() + index * 7 * 24 * 60 * 60 * 1000)
        : recurrence === "monthly"
          ? addMonthsClamped(firstDate, index)
          : firstDate;

    return {
      scheduledFor: scheduledDate.toISOString(),
      recurrenceIndex: index,
      recurrenceTotal: total,
    };
  });
}

function formatTeamRole(role: TeamRole) {
  const labels: Record<TeamRole, string> = {
    owner: "Owners",
    admin: "Admins",
    pastor: "Pastors",
    worship_leader: "Worship Leaders",
    band_leader: "Band Leaders",
    band_member: "Band Members",
    dancer: "Dancers",
    media: "Media Team",
    member: "Members",
  };

  return labels[role];
}

async function resolveNoticeTarget(context: MutationContext, target: NoticeTargetInput): Promise<
  | { ok: true; target: ResolvedNoticeTarget }
  | { ok: false; state: ActionState }
> {
  let query = context.supabase
    .from("team_members")
    .select("id, profile_id, role, profiles ( full_name, email )")
    .eq("team_id", context.teamId)
    .eq("status", "active");

  if (target.targetType === "role") {
    query = query.eq("role", target.targetRole ?? "member");
  }

  if (target.targetType === "person") {
    query = query.eq("id", target.targetMemberId ?? "");
  }

  const { data, error } = await query;

  if (error) {
    return { ok: false, state: { ok: false, message: "Recipients could not be loaded." } };
  }

  const recipients = (data ?? []) as unknown as NoticeRecipientRow[];
  const recipientProfileIds = Array.from(new Set(recipients.map((member) => member.profile_id).filter(Boolean)));

  if (recipientProfileIds.length === 0) {
    return { ok: false, state: { ok: false, message: "No active members match that target." } };
  }

  if (target.targetType === "role" && target.targetRole) {
    return {
      ok: true,
      target: {
        targetRole: target.targetRole,
        targetProfileId: null,
        targetLabel: formatTeamRole(target.targetRole),
        recipientProfileIds,
      },
    };
  }

  if (target.targetType === "person") {
    const member = recipients[0];
    const profile = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
    const label = profile?.full_name ?? profile?.email ?? "Selected person";

    return {
      ok: true,
      target: {
        targetRole: null,
        targetProfileId: member.profile_id,
        targetLabel: label,
        recipientProfileIds,
      },
    };
  }

  return {
    ok: true,
    target: {
      targetRole: null,
      targetProfileId: null,
      targetLabel: "All team",
      recipientProfileIds,
    },
  };
}

export async function signInWithGoogle() {
  if (!hasSupabaseEnv()) {
    redirect("/login?error=config");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

export async function signInWithEmail(formData: FormData) {
  const email = z.string().trim().email().parse(formData.get("email"));

  if (!hasSupabaseEnv()) {
    redirect("/login?error=config");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    redirect("/login?error=email");
  }

  redirect("/login?sent=1");
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/");
}

export async function createTeamAction(formData: FormData) {
  const name = teamNameSchema.parse(formData.get("name") ?? "Anointed Worship");
  const location = formData.get("location") as string || "";
  const serviceTime = formData.get("serviceTime") as string || "9:00 AM";
  const ministryRole = normalizeJoinableRole(formData.get("role"));
  const ministry = ministryLabelForRole(ministryRole);

  if (!hasSupabaseEnv()) {
    redirect("/login?error=config");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = user?.id;

  if (!profileId) {
    redirect("/login");
  }

  // Ensure profile row exists (important in case database tables were truncated/reset)
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (!profile) {
    await supabase.from("profiles").insert({
      id: profileId,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "New User",
    });
  }

  let createdTeamId: string | null = null;
  let createdTeamMemberId: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTeamCode(name, `${profileId}:${Date.now()}:${attempt}`);
    const { data, error } = await supabase
      .rpc("create_team_workspace", {
        p_name: name,
        p_code: code,
        p_default_service_location: location || "Main Sanctuary",
        p_default_call_time: toPostgresTime(serviceTime),
        p_default_rehearsal_time: toPostgresTime("08:15 AM"),
      })
      .single();

    if (!error && data) {
      createdTeamId = data.team_id;
      createdTeamMemberId = data.team_member_id;
      break;
    }

    if (error?.code !== "23505") {
      console.error("create_team_workspace failed:", error);
      redirect("/teams/new?error=create");
    }
  }

  if (!createdTeamId) {
    redirect("/teams/new?error=code");
  }

  if (createdTeamMemberId) {
    const { error: ministryError } = await supabase
      .from("team_members")
      .update({ ministry })
      .eq("id", createdTeamMemberId)
      .eq("team_id", createdTeamId);

    if (ministryError) {
      console.warn("Owner ministry role could not be saved:", ministryError.message);
    }
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function joinTeamAction(formData: FormData) {
  joinCodeSchema.parse(formData.get("code"));

  if (!hasSupabaseEnv()) {
    redirect("/login?error=config");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = user?.id;

  if (!profileId) {
    redirect("/login");
  }

  // Ensure profile row exists (important in case database tables were truncated/reset)
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (!profile) {
    await supabase.from("profiles").insert({
      id: profileId,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "New User",
    });
  }

  // Clean up orphaned active membership from deleted teams
  const { data: membership } = await supabase
    .from("team_members")
    .select("id, team_id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership?.team_id) {
    const { data: teamExists } = await supabase
      .from("teams")
      .select("id")
      .eq("id", membership.team_id)
      .maybeSingle();

    if (!teamExists) {
      await supabase.from("team_members").delete().eq("id", membership.id);
    } else {
      redirect("/dashboard");
    }
  }

  const { data: existingPendingRequest } = await supabase
    .from("join_requests")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (existingPendingRequest) {
    redirect("/pending");
  }

  const code = joinCodeSchema.parse(formData.get("code"));
  const roleInput = normalizeJoinableRole(formData.get("role"));
  const requestedRole = roleInput as TeamRole;

  const normalizedCode = code.trim().toUpperCase();
  let team = null;

  const { data: dbTeam } = await supabase.from("teams").select("id").eq("code", normalizedCode).maybeSingle();
  if (dbTeam) {
    team = dbTeam;
  } else {
    const mockTeams: Record<string, string> = {
      "DM-10001": "Demo Worship Team",
      "DM-10002": "Demo Worship Collective",
      "DM-10003": "Demo Creative Team",
    };
    const mockName = mockTeams[normalizedCode];
    if (mockName) {
      const newTeamId = randomUUID();
      const { data: seededTeam } = await supabase
        .from("teams")
        .insert({
          id: newTeamId,
          name: mockName,
          code: normalizedCode,
          owner_id: profileId,
        })
        .select("id")
        .maybeSingle();

      if (seededTeam) {
        team = seededTeam;
      }
    }
  }

  if (!team) {
    redirect("/teams/join?error=not-found");
  }

  const isMockTeam = ["DM-10001", "DM-10002", "DM-10003"].includes(normalizedCode);

  if (isMockTeam) {
    const ministry = ministryLabelForRole(roleInput);

    const { error: memberError } = await supabase.from("team_members").insert({
      team_id: team.id,
      profile_id: profileId,
      role: requestedRole,
      status: "active",
      ministry,
    });

    if (memberError) {
      console.error("DEBUG: mock team auto-join failed:", memberError);
      redirect(`/teams/join?error=${encodeURIComponent(memberError.message)}`);
    }

    revalidatePath("/dashboard");
    redirect("/dashboard");
  } else {
    const { error: insertError } = await supabase.from("join_requests").upsert(
      {
        team_id: team.id,
        profile_id: profileId,
        requested_role: requestedRole,
        status: "pending",
      },
      { onConflict: "team_id,profile_id" }
    );

    if (insertError) {
      console.error("DEBUG: join_requests insert failed:", insertError);
      redirect(`/teams/join?error=${encodeURIComponent(insertError.message)}`);
    }

    redirect("/pending");
  }
}

export async function getPendingJoinRequestStatusAction(): Promise<{
  status: "active" | "pending" | "approved" | "rejected" | "canceled" | "none";
}> {
  if (!hasSupabaseEnv()) {
    return { status: "pending" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "none" };
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("id, team_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membership?.team_id) {
    const { data: team } = await supabase.from("teams").select("id").eq("id", membership.team_id).maybeSingle();
    if (team) {
      return { status: "active" };
    }
  }

  const { data: request } = await supabase
    .from("join_requests")
    .select("status")
    .eq("profile_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { status: request?.status ?? "none" };
}

export async function cancelJoinRequestAction(formData: FormData): Promise<ActionState> {
  const parsed = z.object({ requestId: z.string().min(1) }).safeParse({
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  if (!hasSupabaseEnv()) {
    return { ok: true, message: "Demo request canceled." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authRequiredState;
  }

  const { data: request, error: requestError } = await supabase
    .from("join_requests")
    .select("id, status")
    .eq("id", parsed.data.requestId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (requestError || !request) {
    return { ok: false, message: "Join request could not be found." };
  }

  if (request.status !== "pending") {
    return { ok: false, message: "Only pending join requests can be canceled." };
  }

  const { error } = await supabase
    .from("join_requests")
    .update({ status: "canceled", reviewed_by: null, reviewed_at: new Date().toISOString() })
    .eq("id", parsed.data.requestId)
    .eq("profile_id", user.id)
    .eq("status", "pending");

  if (error) {
    return { ok: false, message: "Join request could not be canceled." };
  }

  revalidatePath("/pending");
  revalidatePath("/teams");
  revalidatePath("/teams/join");
  revalidatePath("/members");
  revalidatePath("/members/requests");
  revalidatePath("/dashboard");

  return { ok: true, message: "Join request canceled." };
}

type ParsedSetlistInput = z.infer<typeof setlistInputSchema>;

type ParsedEventInput = z.infer<typeof eventInputSchema>;

function buildEventAssignments(eventId: string, data: ParsedEventInput) {
  const assignmentsToInsert: Array<{ event_id: string; team_member_id: string; assignment: string }> = [];

  if (data.worshipLeader) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.worshipLeader, assignment: "Worship Leader" });
  }
  if (data.acousticGuitar) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.acousticGuitar, assignment: "Acoustic Guitar" });
  }
  if (data.electricGuitar) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.electricGuitar, assignment: "Electric Guitar" });
  }
  if (data.bass) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.bass, assignment: "Bass" });
  }
  if (data.drums) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.drums, assignment: "Drums" });
  }
  if (data.mainKeys) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.mainKeys, assignment: "Main Keys" });
  }
  if (data.secondKeys) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.secondKeys, assignment: "Second Keys" });
  }
  for (const memberId of data.extraBandMembers ?? []) {
    if (memberId) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: memberId, assignment: "Band Member" });
    }
  }
  if (data.media) {
    assignmentsToInsert.push({ event_id: eventId, team_member_id: data.media, assignment: "Media" });
  }
  for (const dancerId of data.dancers ?? []) {
    if (dancerId) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: dancerId, assignment: "Dancers" });
    }
  }
  for (const singerId of data.backupSingers ?? []) {
    if (singerId) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: singerId, assignment: "Backup Singer" });
    }
  }

  return assignmentsToInsert;
}

function buildSetlistSnapshot(data: ParsedSetlistInput) {
  return {
    title: data.title,
    serviceDate: data.serviceDate,
    eventType: data.eventType,
    serviceType: data.serviceType,
    location: data.location,
    callTime: data.callTime,
    rehearsalTime: data.rehearsalTime,
    notes: data.notes ?? "",
    
  };
}

async function getServiceTemplateName(context: MutationContext, templateId?: string) {
  if (!templateId) return undefined;

  const { data } = await context.supabase
    .from("service_templates")
    .select("name")
    .eq("id", templateId)
    .eq("team_id", context.teamId)
    .maybeSingle();

  return data?.name ?? undefined;
}

async function logSetlistChange(
  context: MutationContext,
  input: {
    setlistId: string;
    changeType: SetlistChangeType;
    summary: string;
    snapshot?: any;
  },
) {
  const { error } = await context.supabase.from("setlist_change_log").insert({
    setlist_id: input.setlistId,
    team_id: context.teamId,
    changed_by: context.userId,
    change_type: input.changeType,
    summary: input.summary,
    snapshot: input.snapshot ?? {},
  });

  if (error) {
    console.warn("Setlist history could not be recorded:", error.message);
  }
}

export async function createSetlistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setlistInputSchema.safeParse({
    title: formString(formData, "title"),
    serviceDate: formString(formData, "serviceDate"),
    eventType: formString(formData, "eventType") || "service",
    serviceType: optionalFormString(formData, "serviceType"),
    location: formString(formData, "location"),
    callTime: formString(formData, "callTime"),
    rehearsalTime: formString(formData, "rehearsalTime"),
    
    notes: formString(formData, "notes"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "setlists") };
  }

  const serviceTimes = normalizeSetlistServiceTimes(parsed.data.eventType, parsed.data.serviceType);

  // 1. Resolve or Create the associated event
  let resolvedEventId = formString(formData, "eventId");

  if (resolvedEventId) {
    const { error: updateError } = await context.supabase
      .from("events")
      .update({
        type: parsed.data.eventType,
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: toPostgresTime(parsed.data.callTime),
        call_time: toPostgresTime(parsed.data.callTime),
        rehearsal_time: toPostgresTime(parsed.data.rehearsalTime),
        location: parsed.data.location,
      })
      .eq("id", resolvedEventId);

    if (updateError) {
      return { ok: false, message: "Could not update associated service event." };
    }
  } else {
    const { data: eventData, error: eventError } = await context.supabase
      .from("events")
      .insert({
        team_id: context.teamId,
        type: parsed.data.eventType,
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: toPostgresTime(parsed.data.callTime),
        call_time: toPostgresTime(parsed.data.callTime),
        rehearsal_time: toPostgresTime(parsed.data.rehearsalTime),
        location: parsed.data.location,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (eventError || !eventData) {
      return { ok: false, message: "Could not create associated service event." };
    }
    resolvedEventId = eventData.id;
  }

  // 2. Create the setlist linked to the event
  const { data: setlistData, error: setlistError } = await context.supabase
    .from("setlists")
    .insert({
      team_id: context.teamId,
      event_id: resolvedEventId,
      name: parsed.data.title,
      setlist_date: parsed.data.serviceDate,
      location: parsed.data.location,
      call_time: parsed.data.callTime,
      rehearsal_time: parsed.data.rehearsalTime,
      service_times: serviceTimes,
      leader_member_id: parsed.data.worshipLeader,
      notes: parsed.data.notes ?? null,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (setlistError || !setlistData) {
    if (!formString(formData, "eventId")) {
      await context.supabase.from("events").delete().eq("id", resolvedEventId);
    }
    return { ok: false, message: "Setlist could not be saved. Please try again." };
  }

  

  await logSetlistChange(context, {
    setlistId: setlistData.id,
    changeType: "created",
    summary: "Created setlist.",
    snapshot: buildSetlistSnapshot(parsed.data),
  });

  revalidatePath("/setlists");
  redirect(`/setlists/${setlistData.id}`);
}

export async function updateSetlistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = formString(formData, "setlistId");
  const parsed = setlistInputSchema.safeParse({
    title: formString(formData, "title"),
    serviceDate: formString(formData, "serviceDate"),
    eventType: formString(formData, "eventType") || "service",
    serviceType: optionalFormString(formData, "serviceType"),
    location: formString(formData, "location"),
    callTime: formString(formData, "callTime"),
    rehearsalTime: formString(formData, "rehearsalTime"),
    
    notes: formString(formData, "notes"),
  });

  if (!id) {
    return { ok: false, message: "Setlist id is missing." };
  }

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const serviceTimes = normalizeSetlistServiceTimes(parsed.data.eventType, parsed.data.serviceType);

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  // Fetch current setlist to check for linked event_id
  const { data: currentSetlist } = await context.supabase
    .from("setlists")
    .select("event_id")
    .eq("id", id)
    .single();

  let eventId = currentSetlist?.event_id;

  if (!eventId) {
    // If no event linked, create one
    const { data: eventData, error: eventError } = await context.supabase
      .from("events")
      .insert({
        team_id: context.teamId,
        type: parsed.data.eventType,
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: toPostgresTime(parsed.data.callTime),
        call_time: toPostgresTime(parsed.data.callTime),
        rehearsal_time: toPostgresTime(parsed.data.rehearsalTime),
        location: parsed.data.location,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (!eventError && eventData) {
      eventId = eventData.id;
    }
  } else {
    // Update existing event
    await context.supabase
      .from("events")
      .update({
        type: parsed.data.eventType,
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: toPostgresTime(parsed.data.callTime),
        call_time: toPostgresTime(parsed.data.callTime),
        rehearsal_time: toPostgresTime(parsed.data.rehearsalTime),
        location: parsed.data.location,
      })
      .eq("id", eventId);
  }

  const { error } = await context.supabase
    .from("setlists")
    .update({
      name: parsed.data.title,
      event_id: eventId || null,
      setlist_date: parsed.data.serviceDate,
      location: parsed.data.location,
      call_time: parsed.data.callTime,
      rehearsal_time: parsed.data.rehearsalTime,
      service_times: serviceTimes,
      leader_member_id: parsed.data.worshipLeader,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", id)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Setlist changes could not be saved." };
  }

  if (eventId) {
    await logSetlistChange(context, {
      setlistId: id,
      changeType: "updated",
      summary: "Updated setlist details.",
      snapshot: buildSetlistSnapshot(parsed.data),
    });
  }

  revalidatePath("/setlists");
  revalidatePath(`/setlists/${id}`);
  return { ok: true, message: "Setlist saved." };
}

export async function createServiceTemplateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = serviceTemplateInputSchema.safeParse({
    name: formString(formData, "name"),
    serviceType: formString(formData, "serviceType") || "Sunday Worship",
    location: formString(formData, "location") || "Main Sanctuary",
    callTime: formString(formData, "callTime") || "08:00",
    rehearsalTime: formString(formData, "rehearsalTime") || "08:30",
    reminderFrequency: formString(formData, "reminderFrequency") || "weekly",
    reminderOccurrences: formString(formData, "reminderOccurrences") || "4",
    
    
    
    
    
    
    
    
    
    
    
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return { ...context.state, message: "Only owners and admins can create service templates." };
  }

  const defaultRoles = {
    worshipLeader: parsed.data.worshipLeader ?? "",
    acousticGuitar: parsed.data.acousticGuitar ?? "",
    electricGuitar: parsed.data.electricGuitar ?? "",
    bass: parsed.data.bass ?? "",
    drums: parsed.data.drums ?? "",
    mainKeys: parsed.data.mainKeys ?? "",
    secondKeys: parsed.data.secondKeys ?? "",
    extraBandMembers: parsed.data.extraBandMembers ?? [],
    backupSingers: parsed.data.backupSingers ?? [],
    media: parsed.data.media ?? "",
    dancers: parsed.data.dancers ?? [],
  };

  const { error } = await context.supabase.from("service_templates").upsert(
    {
      team_id: context.teamId,
      name: parsed.data.name,
      service_type: parsed.data.serviceType,
      location: parsed.data.location,
      call_time: parsed.data.callTime,
      rehearsal_time: parsed.data.rehearsalTime,
      reminder_frequency: parsed.data.reminderFrequency,
      reminder_occurrences: parsed.data.reminderOccurrences,
      default_roles: defaultRoles,
      created_by: context.userId,
    },
    { onConflict: "team_id,name" },
  );

  if (error) {
    return { ok: false, message: "Service template could not be saved." };
  }

  revalidatePath("/setlists/new");
  revalidatePath("/setlists");
  return { ok: true, message: "Service template saved." };
}

export async function deleteSetlistAction(formData: FormData): Promise<ActionState> {
  const setlistId = formData.get("setlistId") as string;
  if (!setlistId) {
    return { ok: false, message: "Setlist ID is required." };
  }

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  try {
    const { data: setlist } = await context.supabase
      .from("setlists")
      .select("event_id")
      .eq("id", setlistId)
      .maybeSingle();

    await context.supabase.from("setlist_songs").delete().eq("setlist_id", setlistId);
    const { error } = await context.supabase.from("setlists").delete().eq("id", setlistId);

    if (error) {
      return { ok: false, message: "Could not delete setlist: " + error.message };
    }

    if (setlist?.event_id) {
      await context.supabase.from("attendance").delete().eq("event_id", setlist.event_id);
      await context.supabase.from("event_assignments").delete().eq("event_id", setlist.event_id);
      await context.supabase.from("events").delete().eq("id", setlist.event_id);
    }
  } catch (e: any) {
    return { ok: false, message: "Database deletion failed: " + (e.message || e) };
  }

  revalidatePath("/setlists");
  redirect("/setlists");
}

export async function addSetlistSongAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setlistSongInputSchema.safeParse({
    setlistId: formString(formData, "setlistId"),
    songId: formString(formData, "songId"),
    assignedKey: formString(formData, "assignedKey"),
    bpm: formString(formData, "bpm"),
    lead: formString(formData, "lead"),
    youtubeUrl: formString(formData, "youtubeUrl"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  const { count } = await context.supabase
    .from("setlist_songs")
    .select("id", { count: "exact", head: true })
    .eq("setlist_id", parsed.data.setlistId);

  const [{ data: setlist }, { data: song }] = await Promise.all([
    context.supabase
      .from("setlists")
      .select("id, team_id")
      .eq("id", parsed.data.setlistId)
      .eq("team_id", context.teamId)
      .maybeSingle(),
    context.supabase
      .from("songs")
      .select("title")
      .eq("id", parsed.data.songId)
      .eq("team_id", context.teamId)
      .maybeSingle(),
  ]);

  if (!setlist) {
    return { ok: false, message: "Setlist could not be found." };
  }

  const { error } = await context.supabase.from("setlist_songs").insert({
    setlist_id: parsed.data.setlistId,
    song_id: parsed.data.songId,
    song_order: (count ?? 0) + 1,
    assigned_key: parsed.data.assignedKey,
    notes: parsed.data.lead ? `Lead: ${parsed.data.lead}` : null,
    youtube_url: parsed.data.youtubeUrl || null,
  });

  if (error) {
    return { ok: false, message: "Song could not be added to the setlist." };
  }

  await logSetlistChange(context, {
    setlistId: parsed.data.setlistId,
    changeType: "song_added",
    summary: `Added ${song?.title ?? "a song"} in ${parsed.data.assignedKey}.`,
    snapshot: {
      songId: parsed.data.songId,
      songTitle: song?.title ?? null,
      assignedKey: parsed.data.assignedKey,
      lead: parsed.data.lead ?? "",
      youtubeUrl: parsed.data.youtubeUrl ?? "",
      order: (count ?? 0) + 1,
    },
  });

  revalidatePath(`/setlists/${parsed.data.setlistId}`);
  redirect(`/setlists/${parsed.data.setlistId}`);
}

export async function addMultipleSetlistSongsAction(
  setlistId: string,
  songsToAdd: { songId: string; assignedKey: string; type: "Worship" | "Praise" | "None" }[]
): Promise<{ ok: boolean; message?: string }> {
  if (!songsToAdd.length) return { ok: true };

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return { ok: false, message: context.state.message };
  }

  const { count } = await context.supabase
    .from("setlist_songs")
    .select("id", { count: "exact", head: true })
    .eq("setlist_id", setlistId);

  const { data: setlist } = await context.supabase
    .from("setlists")
    .select("id, team_id")
    .eq("id", setlistId)
    .eq("team_id", context.teamId)
    .maybeSingle();

  if (!setlist) {
    return { ok: false, message: "Setlist could not be found." };
  }

  let orderCursor = (count ?? 0) + 1;
  const inserts = songsToAdd.map((s) => {
    const row = {
      setlist_id: setlistId,
      song_id: s.songId,
      song_order: orderCursor,
      assigned_key: s.assignedKey,
      notes: s.type !== "None" ? `${s.type} Song` : null,
    };
    orderCursor++;
    return row;
  });

  const { error } = await context.supabase.from("setlist_songs").insert(inserts);

  if (error) {
    return { ok: false, message: "Songs could not be added to the setlist." };
  }

  await logSetlistChange(context, {
    setlistId: setlistId,
    changeType: "song_added",
    summary: `Added ${songsToAdd.length} songs to the setlist.`,
    snapshot: {
      addedCount: songsToAdd.length,
    },
  });

  revalidatePath(`/setlists/${setlistId}`);
  // We do not redirect here because it's called from a client component's custom transition
  return { ok: true };
}

export async function removeSetlistSongAction(formData: FormData): Promise<ActionState> {
  const setlistId = formString(formData, "setlistId");
  const slotId = formString(formData, "slotId");

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  const { data: slot } = await context.supabase
    .from("setlist_songs")
    .select("song_order, assigned_key, song:songs(title), setlist:setlists(team_id)")
    .eq("id", slotId)
    .maybeSingle() as any;

  const { error } = await context.supabase.from("setlist_songs").delete().eq("id", slotId);
  if (error) {
    return { ok: false, message: "Song could not be removed." };
  }

  // Re-sequence the remaining songs to eliminate gaps
  const { data: remainingSongs } = await context.supabase
    .from("setlist_songs")
    .select("id, song_order")
    .eq("setlist_id", setlistId)
    .order("song_order", { ascending: true });

  if (remainingSongs) {
    for (let i = 0; i < remainingSongs.length; i++) {
      const expectedOrder = i + 1;
      if (remainingSongs[i].song_order !== expectedOrder) {
        await context.supabase
          .from("setlist_songs")
          .update({ song_order: expectedOrder })
          .eq("id", remainingSongs[i].id);
      }
    }
  }

  if (slot?.setlist?.team_id === context.teamId) {
    const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
    await logSetlistChange(context, {
      setlistId,
      changeType: "song_removed",
      summary: `Removed ${song?.title ?? "a song"} from the setlist.`,
      snapshot: {
        slotId,
        songTitle: song?.title ?? null,
        assignedKey: slot.assigned_key,
        order: slot.song_order,
      },
    });
  }

  revalidatePath(`/setlists/${setlistId}`);
  return { ok: true, message: "Song removed." };
}


export async function updateSetlistSongKeyAction(formData: FormData): Promise<ActionState> {
  const context = await getMutationContext("setlists.manage");
  if (!context.ok) return context.state;

  const setlistId = formData.get("setlistId")?.toString();
  const slotId = formData.get("slotId")?.toString();
  const assignedKey = formData.get("assignedKey")?.toString();

  if (!setlistId || !slotId || !assignedKey) {
    return { ok: false, message: "Missing required fields." };
  }

  const { error } = await context.supabase
    .from("setlist_songs")
    .update({ assigned_key: assignedKey })
    .eq("id", slotId)
    .eq("setlist_id", setlistId);

  if (error) {
    return { ok: false, message: "Failed to update key." };
  }

  revalidatePath(`/setlists/${setlistId}`);
  revalidatePath(`/setlists/${setlistId}/stage`);
  revalidatePath(`/setlists/${setlistId}/presenter`);
  
  return { ok: true, message: "Key updated." };
}

export async function reorderSetlistSongAction(formData: FormData): Promise<ActionState> {
  const slotId = formString(formData, "slotId");
  const setlistId = formString(formData, "setlistId");
  const nextOrder = z.coerce.number().int().min(1).safeParse(formData.get("songOrder"));

  if (!nextOrder.success) {
    return { ok: false, message: "Song order is invalid." };
  }

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  const { data: slot } = await context.supabase
    .from("setlist_songs")
    .select("song_order, song:songs(title), setlist:setlists(team_id)")
    .eq("id", slotId)
    .maybeSingle() as any;

  const { error } = await context.supabase.from("setlist_songs").update({ song_order: nextOrder.data }).eq("id", slotId);
  if (error) {
    return { ok: false, message: "Song order could not be updated." };
  }

  if (slot?.setlist?.team_id === context.teamId && slot.song_order !== nextOrder.data) {
    const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
    await logSetlistChange(context, {
      setlistId,
      changeType: "song_reordered",
      summary: `Moved ${song?.title ?? "a song"} from ${slot.song_order} to ${nextOrder.data}.`,
      snapshot: {
        slotId,
        songTitle: song?.title ?? null,
        previousOrder: slot.song_order,
        nextOrder: nextOrder.data,
      },
    });
  }

  revalidatePath(`/setlists/${setlistId}`);
  return { ok: true, message: "Song order updated." };
}
export async function updateSongSlotArrangementAction(formData: FormData): Promise<ActionState> {
  const slotId = formString(formData, "slotId");
  const setlistId = formString(formData, "setlistId");
  const arrangement = formString(formData, "arrangement");

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  const { data: slot } = await context.supabase
    .from("setlist_songs")
    .select("song:songs(title), setlist:setlists(team_id)")
    .eq("id", slotId)
    .maybeSingle() as any;

  const { error } = await context.supabase
    .from("setlist_songs")
    .update({ arrangement })
    .eq("id", slotId);

  if (error) {
    return { ok: false, message: "Arrangement could not be updated." };
  }

  if (slot?.setlist?.team_id === context.teamId) {
    const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
    await logSetlistChange(context, {
      setlistId,
      changeType: "updated",
      summary: `Updated arrangement for ${song?.title ?? "a song"}.`,
      snapshot: {
        slotId,
        songTitle: song?.title ?? null,
        arrangement,
      },
    });
  }

  revalidatePath(`/setlists/${setlistId}`);
  return { ok: true, message: "Arrangement updated." };
}

export async function updateAttendanceAction(formData: FormData): Promise<ActionState> {
  const parsed = attendanceSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("attendance.confirm");
  if (!context.ok) {
    return { ok: false, message: "Sign in with Supabase to save attendance." };
  }

  let eventId = parsed.data.eventId;

  // Resolve setlist ID to event ID if needed
  const { data: setlist } = await context.supabase
    .from("setlists")
    .select("event_id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (setlist && setlist.event_id) {
    eventId = setlist.event_id;
  }

  const { error } = await context.supabase.from("attendance").upsert(
    {
      event_id: eventId,
      team_member_id: context.memberId,
      status: parsed.data.status,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "event_id,team_member_id" },
  );

  if (error) {
    return { ok: false, message: "Attendance could not be updated." };
  }

  // Create notification for admins
  try {
    const { data: memberProfile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: eventDetails } = await context.supabase
      .from("events")
      .select("name")
      .eq("id", eventId)
      .maybeSingle();

    const { data: teamAdmins } = await context.supabase
      .from("team_members")
      .select("profile_id")
      .eq("team_id", context.teamId)
      .in("role", ["owner", "admin", "worship_leader"]);

    if (teamAdmins && teamAdmins.length > 0) {
      const notificationsToInsert = teamAdmins
        .filter((adm) => adm.profile_id !== context.userId)
        .map((adm) => ({
          team_id: context.teamId,
          profile_id: adm.profile_id,
          title: "Attendance Updated",
          body: `${memberProfile?.full_name || "A member"} is now ${parsed.data.status} for ${eventDetails?.name || "the service"}.`,
          target_path: `/events/${eventId}`,
        }));

      if (notificationsToInsert.length > 0) {
        await context.supabase.from("notifications").insert(notificationsToInsert);
      }
    }
  } catch (e) {
    console.error("Failed to insert attendance notification:", e);
  }

  revalidatePath("/events");
  revalidatePath("/setlists/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/reminders");
  return { ok: true, message: `Marked ${parsed.data.status}.` };
}

export async function createAnnouncementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = announcementInputSchema.safeParse({
    title: formString(formData, "title"),
    category: formString(formData, "category") || "General",
    body: formString(formData, "body"),
    priority: formString(formData, "priority") || "normal",
    eventId: optionalFormString(formData, "eventId"),
    target: {
      targetType: formString(formData, "targetType") || "all",
      targetRole: formString(formData, "targetRole") || undefined,
      targetMemberId: formString(formData, "targetMemberId") || undefined,
    },
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return { ...context.state, message: "Only owners and admins can add announcements." };
  }

  const resolvedTarget = await resolveNoticeTarget(context, parsed.data.target);
  if (!resolvedTarget.ok) {
    return resolvedTarget.state;
  }

  const { target } = resolvedTarget;
  const { data: announcement, error } = await context.supabase
    .from("announcements")
    .insert({
      team_id: context.teamId,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      priority: parsed.data.priority,
      event_id: parsed.data.eventId || null,
      target_role: target.targetRole,
      target_profile_id: target.targetProfileId,
      target_label: target.targetLabel,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !announcement) {
    return { ok: false, message: "Announcement could not be added." };
  }

  const receipts = target.recipientProfileIds.map((profileId) => ({
    announcement_id: announcement.id,
    team_id: context.teamId,
    profile_id: profileId,
  }));

  if (receipts.length > 0) {
    const { error: receiptError } = await context.supabase.from("announcement_receipts").insert(receipts);

    if (receiptError) {
      return { ok: false, message: "Announcement was added, but delivery tracking could not be created." };
    }
  }

  revalidatePath("/announcements");
  revalidatePath("/dashboard");

  return { ok: true, message: `Announcement added for ${target.targetLabel}.` };
}

export async function createReminderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reminderInputSchema.safeParse({
    title: formString(formData, "title"),
    body: formString(formData, "body"),
    priority: formString(formData, "priority") || "normal",
    eventId: optionalFormString(formData, "eventId"),
    targetPath: formString(formData, "targetPath") || "/reminders",
    scheduledFor: optionalFormString(formData, "scheduledFor"),
    recurrence: formString(formData, "recurrence") || "none",
    occurrences: formString(formData, "occurrences") || "1",
    target: {
      targetType: formString(formData, "targetType") || "all",
      targetRole: formString(formData, "targetRole") || undefined,
      targetMemberId: formString(formData, "targetMemberId") || undefined,
    },
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return { ...context.state, message: "Only owners and admins can add reminders." };
  }

  const resolvedTarget = await resolveNoticeTarget(context, parsed.data.target);
  if (!resolvedTarget.ok) {
    return resolvedTarget.state;
  }

  const { target } = resolvedTarget;
  const noticeGroupId = randomUUID();
  const occurrences = buildReminderOccurrences({
    recurrence: parsed.data.recurrence,
    scheduledFor: parsed.data.scheduledFor,
    occurrences: parsed.data.occurrences,
  });
  const targetPath = parsed.data.eventId ? `/events/${parsed.data.eventId}` : parsed.data.targetPath || "/reminders";
  const notifications = occurrences.flatMap((occurrence) =>
    target.recipientProfileIds.map((profileId) => ({
      team_id: context.teamId,
      profile_id: profileId,
      title: parsed.data.title,
      body: parsed.data.body,
      priority: parsed.data.priority,
      event_id: parsed.data.eventId || null,
      target_path: targetPath,
      target_role: target.targetRole,
      target_profile_id: target.targetProfileId,
      target_label: target.targetLabel,
      scheduled_for: occurrence.scheduledFor,
      recurrence_rule: parsed.data.recurrence,
      recurrence_index: occurrence.recurrenceIndex,
      recurrence_total: occurrence.recurrenceTotal,
      notice_group_id: noticeGroupId,
      created_by: context.userId,
    })),
  );

  const { error } = await context.supabase.from("notifications").insert(notifications);

  if (error) {
    return { ok: false, message: "Reminder could not be added." };
  }

  revalidatePath("/reminders");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message:
      parsed.data.recurrence === "none"
        ? `Reminder sent to ${target.targetLabel}.`
        : `${parsed.data.occurrences} ${parsed.data.recurrence} reminders scheduled for ${target.targetLabel}.`,
  };
}

export async function acknowledgeAnnouncementAction(formData: FormData): Promise<void> {
  const announcementId = formString(formData, "announcementId").trim();
  if (!announcementId) {
    return;
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return;
  }

  const { data: announcement } = await context.supabase
    .from("announcements")
    .select("id")
    .eq("id", announcementId)
    .eq("team_id", context.teamId)
    .maybeSingle();

  if (!announcement) {
    return;
  }

  const acknowledgedAt = new Date().toISOString();
  const { error } = await context.supabase.from("announcement_receipts").upsert(
    {
      announcement_id: announcementId,
      team_id: context.teamId,
      profile_id: context.userId,
      read_at: acknowledgedAt,
      acknowledged_at: acknowledgedAt,
    },
    { onConflict: "announcement_id,profile_id" },
  );

  if (error) {
    return;
  }

  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

export async function acknowledgeReminderAction(formData: FormData): Promise<void> {
  const notificationId = formString(formData, "notificationId").trim();
  if (!notificationId) {
    return;
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return;
  }

  const acknowledgedAt = new Date().toISOString();
  const { error } = await context.supabase
    .from("notifications")
    .update({ read_at: acknowledgedAt, acknowledged_at: acknowledgedAt })
    .eq("id", notificationId)
    .eq("team_id", context.teamId)
    .eq("profile_id", context.userId);

  if (error) {
    return;
  }

  revalidatePath("/reminders");
  revalidatePath("/dashboard");
}

export async function createEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventInputSchema.safeParse({
    title: formString(formData, "title"),
    eventType: formString(formData, "eventType"),
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    rehearsalStartTime: formString(formData, "rehearsalStartTime"),
    rehearsalEndTime: formString(formData, "rehearsalEndTime"),
    rehearsalDate: formString(formData, "rehearsalDate"),
    location: formString(formData, "location"),
    assignedTeams: formString(formData, "assignedTeams"),
    linkedSetlistId: formString(formData, "linkedSetlistId"),
    notes: formString(formData, "notes"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "events") };
  }

  const approvalStatus = can(context.role, "events.manage") ? "approved" : "pending";

  const insertData: Record<string, unknown> = {
    team_id: context.teamId,
    name: parsed.data.title,
    type: parsed.data.eventType,
    event_date: parsed.data.date,
    starts_at: parsed.data.startTime,
    ends_at: parsed.data.endTime || null,
    location: parsed.data.location,
    description: parsed.data.notes || parsed.data.assignedTeams || null,
    approval_status: approvalStatus,
    created_by: context.userId,
  };

  if (parsed.data.rehearsalStartTime) {
    insertData.rehearsal_time = parsed.data.rehearsalStartTime;
  }

  if (parsed.data.rehearsalEndTime) {
    insertData.rehearsal_end_time = parsed.data.rehearsalEndTime;
  }

  if (parsed.data.rehearsalDate) {
    insertData.rehearsal_date = parsed.data.rehearsalDate;
  }

  const { data, error } = await context.supabase
    .from("events")
    .insert(insertData as any)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: error ? error.message : "Event could not be created." };
  }

  
  if (approvalStatus === "approved") {
    const assignmentsToInsert = buildEventAssignments(data.id, parsed.data);
    if (assignmentsToInsert.length > 0) {
      await (context.supabase.from("event_assignments") as any).insert(assignmentsToInsert);
    }
  }

  if (approvalStatus === "approved" && parsed.data.linkedSetlistId && can(context.role, "setlists.manage")) {
    await context.supabase
      .from("setlists")
      .update({ event_id: data.id })
      .eq("id", parsed.data.linkedSetlistId);
  }

  revalidatePath("/events");
  revalidatePath("/dashboard");

  if (approvalStatus === "pending") {
    return {
      ok: true,
      message: "Event request sent. An admin or owner must approve it before it appears as an official event.",
    };
  }

  redirect(`/events/${data.id}`);
}

export async function updateEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = formString(formData, "eventId");
  const parsed = eventInputSchema.safeParse({
    title: formString(formData, "title"),
    eventType: formString(formData, "eventType"),
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    rehearsalStartTime: formString(formData, "rehearsalStartTime"),
    rehearsalEndTime: formString(formData, "rehearsalEndTime"),
    rehearsalDate: formString(formData, "rehearsalDate"),
    location: formString(formData, "location"),
    assignedTeams: formString(formData, "assignedTeams"),
    linkedSetlistId: formString(formData, "linkedSetlistId"),
    notes: formString(formData, "notes"),
  });

  if (!eventId) {
    return { ok: false, message: "Event ID is required." };
  }

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("events.manage");
  if (!context.ok) {
    return { ...context.state, message: "You don't have permission to edit events." };
  }

  const updateData: Record<string, unknown> = {
    name: parsed.data.title,
    type: parsed.data.eventType,
    event_date: parsed.data.date,
    starts_at: parsed.data.startTime,
    ends_at: parsed.data.endTime || null,
    location: parsed.data.location,
    description: parsed.data.notes || parsed.data.assignedTeams || null,
    rehearsal_time: parsed.data.rehearsalStartTime || null,
    rehearsal_end_time: parsed.data.rehearsalEndTime || null,
    rehearsal_date: parsed.data.rehearsalDate || null,
  };

  const { error } = await context.supabase
    .from("events")
    .update(updateData as any)
    .eq("id", eventId)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: error.message };
  }

  if (parsed.data.linkedSetlistId && can(context.role, "setlists.manage")) {
    await context.supabase
      .from("setlists")
      .update({ event_id: eventId })
      .eq("id", parsed.data.linkedSetlistId);
  }

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");

  redirect(`/events/${eventId}`);
}

export async function reviewEventAction(formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    eventId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
  }).safeParse({
    eventId: formData.get("eventId"),
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("events.review");
  if (!context.ok) {
    return {
      ...context.state,
      message: context.state.message.includes("permission")
        ? "Only admins and owners can approve event requests."
        : context.state.message,
    };
  }

  const { error } = await context.supabase
    .from("events")
    .update({ approval_status: parsed.data.decision })
    .eq("id", parsed.data.eventId)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Event request could not be reviewed." };
  }

  revalidatePath("/events");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: parsed.data.decision === "approved" ? "Event approved and added to the calendar." : "Event request rejected.",
  };
}

export async function sendMessageAction(formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    channelId: formData.get("channelId"),
    body: formData.get("body"),
    attachmentFileId: formString(formData, "attachmentFileId") || undefined,
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return { ok: false, message: "Sign in with Supabase to send messages." };
  }

  const attachmentFileId = parsed.data.attachmentFileId ?? null;
  if (attachmentFileId) {
    const { data: attachment, error: attachmentError } = await context.supabase
      .from("practice_files")
      .select("id")
      .eq("id", attachmentFileId)
      .eq("team_id", context.teamId)
      .maybeSingle();

    if (attachmentError || !attachment) {
      return { ok: false, message: "Attachment could not be added to this message." };
    }
  }

  const { data, error } = await context.supabase
    .from("messages")
    .insert({
      channel_id: parsed.data.channelId,
      sender_member_id: context.memberId,
      body: parsed.data.body,
      attachment_file_id: attachmentFileId,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    return { ok: false, message: "Message could not be sent." };
  }

  revalidatePath("/messages");
  return {
    ok: true,
    message: "Message sent.",
    data: {
      messageId: data.id,
      createdAt: data.created_at,
    },
  };
}
export async function createChannelAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  if (!name.success) {
    return validationState(name.error);
  }
  const avatarUrl = formData.get("avatarUrl")?.toString().trim() || null;

  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return context.state;
  }

  if (context.role !== "owner" && context.role !== "admin") {
    return { ok: false, message: "Only owners and admins can create channels." };
  }

  const { data, error } = await (context.supabase
    .from("message_channels") as any)
    .insert({
      team_id: context.teamId,
      name: name.data,
      channel_type: "group",
      created_by: context.userId,
      avatar_url: avatarUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: "Channel could not be created." };
  }

  await context.supabase.from("message_channel_members").insert({ channel_id: data.id, team_member_id: context.memberId });
  revalidatePath("/messages");
  return { ok: true, message: "Channel created.", data: { channelId: data.id, name: name.data } };
}

export async function getOrCreateDirectChannelAction(formData: FormData): Promise<ActionState> {
  const otherMemberId = z.string().trim().min(1).safeParse(formData.get("otherMemberId"));
  if (!otherMemberId.success) {
    return validationState(otherMemberId.error);
  }

  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return context.state;
  }

  // Find if a direct channel exists between context.memberId and otherMemberId
  const { data: myMemberships } = await context.supabase
    .from("message_channel_members")
    .select("channel_id")
    .eq("team_member_id", context.memberId);

  const myChannelIds = myMemberships?.map((m) => m.channel_id) || [];
  let existingChannelId: string | null = null;

  if (myChannelIds.length > 0) {
    const { data: directChannels } = await context.supabase
      .from("message_channels")
      .select("id")
      .in("id", myChannelIds)
      .eq("channel_type", "direct")
      .eq("team_id", context.teamId);

    const directChannelIds = directChannels?.map((c) => c.id) || [];

    if (directChannelIds.length > 0) {
      const { data: otherMembership } = await context.supabase
        .from("message_channel_members")
        .select("channel_id")
        .in("channel_id", directChannelIds)
        .eq("team_member_id", otherMemberId.data)
        .maybeSingle();

      if (otherMembership) {
        existingChannelId = otherMembership.channel_id;
      }
    }
  }

  if (existingChannelId) {
    revalidatePath("/messages");
    return { ok: true, message: "Direct channel found.", data: { channelId: existingChannelId } };
  }

  const { data: newChannel, error: channelError } = await context.supabase
    .from("message_channels")
    .insert({
      team_id: context.teamId,
      name: "Direct Message",
      channel_type: "direct",
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (channelError || !newChannel) {
    return { ok: false, message: "Could not create direct channel." };
  }

  await context.supabase.from("message_channel_members").insert([
    { channel_id: newChannel.id, team_member_id: context.memberId },
    { channel_id: newChannel.id, team_member_id: otherMemberId.data },
  ]);

  revalidatePath("/messages");
  return { ok: true, message: "Direct channel created.", data: { channelId: newChannel.id } };
}

export async function addChannelMemberAction(formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    channelId: z.string().trim().min(1),
    memberId: z.string().trim().min(1),
  }).safeParse({
    channelId: formData.get("channelId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return validationState(parsed.error);

  const context = await getMutationContext();
  if (!context.ok) return context.state;
  if (context.role !== "owner" && context.role !== "admin") {
    return { ok: false, message: "Only owners and admins can manage channel members." };
  }

  const { error } = await context.supabase.from("message_channel_members").insert({
    channel_id: parsed.data.channelId,
    team_member_id: parsed.data.memberId,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, message: "Member is already in this channel." };
    return { ok: false, message: "Could not add member: " + error.message };
  }

  revalidatePath("/messages");
  return { ok: true, message: "Member added to channel." };
}

export async function removeChannelMemberAction(formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    channelId: z.string().trim().min(1),
    memberId: z.string().trim().min(1),
  }).safeParse({
    channelId: formData.get("channelId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return validationState(parsed.error);

  const context = await getMutationContext();
  if (!context.ok) return context.state;
  if (context.role !== "owner" && context.role !== "admin") {
    return { ok: false, message: "Only owners and admins can manage channel members." };
  }

  const { error } = await context.supabase
    .from("message_channel_members")
    .delete()
    .eq("channel_id", parsed.data.channelId)
    .eq("team_member_id", parsed.data.memberId);

  if (error) return { ok: false, message: "Could not remove member: " + error.message };

  revalidatePath("/messages");
  return { ok: true, message: "Member removed from channel." };
}

export async function toggleSongFavoriteAction(formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      songId: z.string().trim().min(1),
      favorite: z.enum(["true", "false"]),
    })
    .safeParse({
      songId: formData.get("songId"),
      favorite: formData.get("favorite"),
    });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return { ok: false, message: "Sign in with Supabase to save song favorites." };
  }

  if (parsed.data.favorite === "true") {
    const { error } = await context.supabase
      .from("song_favorites")
      .upsert({ song_id: parsed.data.songId, team_member_id: context.memberId }, { onConflict: "song_id,team_member_id" });

    if (error) {
      return { ok: false, message: "Favorite could not be saved." };
    }

    revalidatePath("/songs");
    return { ok: true, message: "Favorite saved." };
  }

  const { error } = await context.supabase
    .from("song_favorites")
    .delete()
    .eq("song_id", parsed.data.songId)
    .eq("team_member_id", context.memberId);

  if (error) {
    return { ok: false, message: "Favorite could not be removed." };
  }

  revalidatePath("/songs");
  return { ok: true, message: "Favorite removed." };
}

export async function createDanceChartAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = danceChartInputSchema.safeParse({
    title: formString(formData, "title"),
    songId: formString(formData, "songId"),
    eventId: formString(formData, "eventId"),
    choreographyNotes: formString(formData, "choreographyNotes"),
    formationNotes: formString(formData, "formationNotes"),
    outfitNotes: formString(formData, "outfitNotes"),
    songTitle: formString(formData, "songTitle"),
    songArtist: formString(formData, "songArtist"),
    songVersion: formString(formData, "songVersion"),
    videoUrl: formString(formData, "videoUrl"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("dance_notes.manage");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase.from("dance_notes").insert({
    team_id: context.teamId,
    song_id: parsed.data.songId ?? null,
    event_id: parsed.data.eventId ?? null,
    title: parsed.data.title,
    choreography_notes: parsed.data.choreographyNotes,
    formation_notes: parsed.data.formationNotes || null,
    outfit_notes: parsed.data.outfitNotes || null,
    song_title: parsed.data.songTitle || null,
    song_artist: parsed.data.songArtist || null,
    song_version: parsed.data.songVersion || null,
    video_url: parsed.data.videoUrl || null,
    created_by: context.userId,
  });

  if (error) {
    console.error("Failed to create dance chart:", error);
    return { ok: false, message: `Dance chart could not be saved: ${error.message}` };
  }

  revalidatePath("/dance");
  revalidatePath("/dashboard");
  return { ok: true, message: "Dance chart saved." };
}

export async function updateDanceChartAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const chartId = formString(formData, "chartId");
  const parsed = danceChartInputSchema.safeParse({
    title: formString(formData, "title"),
    songId: formString(formData, "songId"),
    eventId: formString(formData, "eventId"),
    choreographyNotes: formString(formData, "choreographyNotes"),
    formationNotes: formString(formData, "formationNotes"),
    outfitNotes: formString(formData, "outfitNotes"),
    songTitle: formString(formData, "songTitle"),
    songArtist: formString(formData, "songArtist"),
    songVersion: formString(formData, "songVersion"),
    videoUrl: formString(formData, "videoUrl"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("dance_notes.manage");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("dance_notes")
    .update({
      song_id: parsed.data.songId ?? null,
      event_id: parsed.data.eventId ?? null,
      title: parsed.data.title,
      choreography_notes: parsed.data.choreographyNotes,
      formation_notes: parsed.data.formationNotes || null,
      outfit_notes: parsed.data.outfitNotes || null,
      song_title: parsed.data.songTitle || null,
      song_artist: parsed.data.songArtist || null,
      song_version: parsed.data.songVersion || null,
      video_url: parsed.data.videoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chartId)
    .eq("team_id", context.teamId);

  if (error) {
    console.error("Failed to update dance chart:", error);
    return { ok: false, message: `Dance chart could not be saved: ${error.message}` };
  }

  revalidatePath("/dance");
  revalidatePath(`/dance/${chartId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Dance chart saved." };
}

export async function updateChannelPreferenceAction(formData: FormData): Promise<ActionState> {
  const channelId = formString(formData, "channelId");
  const muted = formString(formData, "muted") === "true";

  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("message_channel_members")
    .update({ muted_at: muted ? new Date().toISOString() : null })
    .eq("channel_id", channelId)
    .eq("team_member_id", context.memberId);

  if (error) {
    return { ok: false, message: "Channel preference could not be updated." };
  }

  revalidatePath("/messages");
  return { ok: true, message: muted ? "Channel muted." : "Channel unmuted." };
}

export async function leaveChannelAction(formData: FormData): Promise<ActionState> {
  const channelId = formString(formData, "channelId");
  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("message_channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("team_member_id", context.memberId);

  if (error) {
    return { ok: false, message: "Could not leave channel." };
  }

  revalidatePath("/messages");
  return { ok: true, message: "Left channel." };
}

export async function inviteMemberAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = inviteMemberSchema.safeParse({
    email: formString(formData, "email"),
    role: formString(formData, "role"),
    message: formString(formData, "message"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "invitations") };
  }

  const { error } = await context.supabase.from("team_invitations").insert({
    team_id: context.teamId,
    email: parsed.data.email,
    role: parsed.data.role,
    message: parsed.data.message || null,
    invited_by: context.userId,
    status: "pending",
  });

  if (error) {
    return { ok: false, message: "Invitation could not be saved." };
  }

  revalidatePath("/members");
  return { ok: true, message: "Invitation saved." };
}

export async function reviewJoinRequestAction(formData: FormData): Promise<void> {
  await reviewJoinRequestWithStateAction(formData);
}

export async function reviewJoinRequestWithStateAction(formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    requestId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
  }).safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("join_requests.review");
  if (!context.ok) {
    revalidatePath("/members");
    revalidatePath("/members/requests");
    return context.state;
  }

  const { data: request } = await context.supabase
    .from("join_requests")
    .select("team_id, profile_id, requested_role")
    .eq("id", parsed.data.requestId)
    .eq("team_id", context.teamId)
    .eq("status", "pending")
    .maybeSingle();

  if (!request) {
    return { ok: false, message: "Join request could not be reviewed." };
  }

  const reviewedAt = new Date().toISOString();

  if (parsed.data.decision === "approved") {
    const { data: approvedMember, error: memberError } = await context.supabase
      .from("team_members")
      .upsert(
        {
          team_id: request.team_id,
          profile_id: request.profile_id,
          role: request.requested_role,
          status: "active",
          ministry: ministryLabelForRole(request.requested_role),
        },
        { onConflict: "team_id,profile_id" },
      )
      .select("id")
      .single();

    if (memberError || !approvedMember) {
      return { ok: false, message: "Join request was approved, but the member could not be added." };
    }

    const { data: defaultChannel } = await context.supabase
      .from("message_channels")
      .select("id")
      .eq("team_id", request.team_id)
      .eq("channel_type", "team")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultChannel) {
      const { error: channelMemberError } = await context.supabase.from("message_channel_members").insert({
          channel_id: defaultChannel.id,
          team_member_id: approvedMember.id,
        });

      if (channelMemberError && channelMemberError.code !== "23505") {
        return { ok: false, message: "Join request was approved, but the member could not be added to team chat." };
      }
    }
  }

  const { error } = await context.supabase
    .from("join_requests")
    .update({ status: parsed.data.decision, reviewed_by: context.userId, reviewed_at: reviewedAt })
    .eq("id", parsed.data.requestId)
    .eq("team_id", context.teamId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, message: "Join request could not be reviewed." };
  }

  revalidatePath("/members");
  revalidatePath("/members/requests");
  revalidatePath("/dashboard");
  revalidatePath("/messages");
  revalidatePath("/pending");

  return {
    ok: true,
    message: parsed.data.decision === "approved" ? "Join request approved." : "Join request rejected.",
  };
}

export async function updateMemberRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = memberRoleSchema.safeParse({
    memberId: formData.get("memberId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("team_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.memberId)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Role could not be updated." };
  }

  revalidatePath("/members");
  return { ok: true, message: "Role updated." };
}

export async function removeTeamMemberAction(formData: FormData): Promise<ActionState> {
  const memberId = formData.get("memberId") as string;
  if (!memberId) {
    return { ok: false, message: "Missing member ID." };
  }

  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Could not remove member." };
  }

  revalidatePath("/members");
  return { ok: true, message: "Member removed from team." };
}

export async function regenerateTeamCodeAction(): Promise<ActionState> {
  const context = await getMutationContext("members.manage");
  if (!context.ok) {
    return context.state;
  }

  const { data: team } = await context.supabase.from("teams").select("name").eq("id", context.teamId).single();
  const code = generateTeamCode(team?.name ?? "Team", `${context.teamId}:${Date.now()}`);
  const { error } = await context.supabase.from("teams").update({ code }).eq("id", context.teamId);

  if (error) {
    return { ok: false, message: "Team code could not be regenerated." };
  }

  revalidatePath("/members");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Team code regenerated." };
}

export async function updateProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileInputSchema.safeParse({
    fullName: formString(formData, "fullName"),
    primaryRole: formString(formData, "primaryRole"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return { ...context.state, message: "Profile save requires sign-in." };
  }

  const { error: profileError } = await context.supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", context.userId);
  const { error: memberError } = await context.supabase
    .from("team_members")
    .update({ ministry: parsed.data.primaryRole })
    .eq("id", context.memberId);

  if (profileError || memberError) {
    return { ok: false, message: "Profile could not be saved." };
  }

  revalidatePath("/profile");
  revalidatePath("/members");
  return { ok: true, message: "Profile saved." };
}

export async function updateProfilePhotoAction(formData: FormData): Promise<ActionState> {
  const parsed = profileAvatarUrlSchema.safeParse(formData.get("avatarUrl"));

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return { ...context.state, message: "Profile photo upload requires sign-in." };
  }

  const { data, error } = await context.supabase
    .from("profiles")
    .update({ avatar_url: parsed.data })
    .eq("id", context.userId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "Profile photo could not be saved." };
  }

  revalidatePath("/profile");
  revalidatePath("/members");
  revalidatePath("/messages");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile photo updated." };
}

export async function updateTeamSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const preferences = ["pendingRequests", "upcomingEvents", "unreadMessages", "attendanceReminders"].filter(
    (key) => formData.get(key) === "on",
  );
  const parsed = teamSettingsSchema.safeParse({
    teamName: formString(formData, "teamName"),
    notificationPreferences: preferences,
    defaultServiceLocation: formString(formData, "defaultServiceLocation"),
    defaultCallTime: formString(formData, "defaultCallTime"),
    defaultRehearsalTime: formString(formData, "defaultRehearsalTime"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("team.manage");
  if (!context.ok) {
    return { ...context.state, message: "Settings save requires sign-in." };
  }

  const { error: teamError } = await context.supabase.from("teams").update({ name: parsed.data.teamName }).eq("id", context.teamId);
  const { error: settingsError } = await context.supabase.from("team_settings").upsert(
    {
      team_id: context.teamId,
      notification_preferences: parsed.data.notificationPreferences,
      default_service_location: parsed.data.defaultServiceLocation,
      default_call_time: parsed.data.defaultCallTime,
      default_rehearsal_time: parsed.data.defaultRehearsalTime,
    },
    { onConflict: "team_id" },
  );

  if (teamError || settingsError) {
    return { ok: false, message: "Settings could not be saved." };
  }

  revalidateAppShell();
  return { ok: true, message: "Settings saved." };
}

export async function deleteTeamAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const confirmText = formData.get("confirmText") as string;
  if (confirmText !== "DELETE TEAM") {
    return { ok: false, message: "Type 'DELETE TEAM' exactly to confirm." };
  }

  const requestedTeamId = formString(formData, "teamId").trim();
  const context = await getMutationContext("team.manage", requestedTeamId);
  if (!context.ok) {
    return { ...context.state, message: "Deleting a team requires being logged in." };
  }

  if (context.role !== "owner") {
    return { ok: false, message: "Only the team owner is authorized to delete the team." };
  }

  try {
    const { error } = await context.supabase.rpc("delete_team_workspace", {
      p_team_id: context.teamId,
    });

    if (error) {
      return { ok: false, message: "Failed to delete team: " + error.message };
    }
  } catch (e: any) {
    return { ok: false, message: "Deletion failed: " + (e.message || e) };
  }

  revalidateAppShell();
  redirect("/teams");
}

export async function leaveTeamAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const confirmText = formData.get("confirmText") as string;
  if (confirmText !== "LEAVE TEAM") {
    return { ok: false, message: "Type 'LEAVE TEAM' exactly to confirm." };
  }

  const requestedTeamId = formString(formData, "teamId").trim();
  const context = await getMutationContext(undefined, requestedTeamId);
  if (!context.ok) {
    return { ...context.state, message: "Leaving a team requires being logged in." };
  }

  if (context.role === "owner") {
    return { ok: false, message: "Owners cannot leave the team. You must transfer ownership or delete the team." };
  }

  try {
    // 1. Delete member's attendance
    await context.supabase.from("attendance").delete().eq("team_member_id", context.memberId);
    
    // 2. Delete member channel memberships
    await context.supabase.from("message_channel_members").delete().eq("team_member_id", context.memberId);

    // 3. Delete the team member row
    const { error } = await context.supabase
      .from("team_members")
      .delete()
      .eq("id", context.memberId);

    if (error) {
      return { ok: false, message: "Failed to leave team: " + error.message };
    }
  } catch (e: any) {
    return { ok: false, message: "Leaving team failed: " + (e.message || e) };
  }

  revalidateAppShell();
  redirect("/teams");
}

export async function getTeamPreviewAction(code: string): Promise<{
  ok: boolean;
  message?: string;
  team?: {
    name: string;
    location: string;
    members: number;
    serviceTime: string;
    leader: string;
  };
}> {
  const normalizedCode = code.trim().toUpperCase();

  const mockTeams: Record<string, { name: string; location: string; members: number; serviceTime: string; leader: string }> = {
    "DM-10001": {
      name: "Demo Worship Team",
      location: "Demo City",
      members: 8,
      serviceTime: "Sundays at 10:00 AM",
      leader: "Alex Morgan",
    },
    "DM-10002": {
      name: "Demo Worship Collective",
      location: "Demo Campus",
      members: 12,
      serviceTime: "Sundays at 9:00 AM",
      leader: "Casey Lee",
    },
    "DM-10003": {
      name: "Demo Creative Team",
      location: "Demo Sanctuary",
      members: 29,
      serviceTime: "Sundays at 9:00 AM",
      leader: "Jordan Reed",
    },
  };

  if (mockTeams[normalizedCode]) {
    return { ok: true, team: mockTeams[normalizedCode] };
  }

  if (!hasSupabaseEnv()) {
    return { ok: false, team: undefined };
  }

  try {
    const supabase = await createClient();
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, owner_id")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (teamError || !team) {
      return { ok: false, team: undefined };
    }

    let leaderName = "Alex Morgan";
    if (team.owner_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", team.owner_id)
        .maybeSingle();
      if (profile?.full_name) {
        leaderName = profile.full_name;
      }
    }

    const { data: settings } = await supabase
      .from("team_settings")
      .select("default_service_location, default_call_time")
      .eq("team_id", team.id)
      .maybeSingle();

    const { count } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", team.id)
      .eq("status", "active");

    return {
      ok: true,
      team: {
        name: team.name,
        location: settings?.default_service_location || "Main Campus",
        members: count || 1,
        serviceTime: settings?.default_call_time 
          ? `Sundays at ${settings.default_call_time.substring(0, 5)}`
          : "Sundays at 9:00 AM",
        leader: leaderName,
      },
    };
  } catch (e) {
    return { ok: false, team: undefined };
  }
}



export async function createSongAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = songInputSchema.safeParse({
    title: formString(formData, "title"),
    artist: formString(formData, "artist"),
    originalKey: formString(formData, "originalKey"),
    bpm: formData.get("bpm"),
    timeSignature: formString(formData, "timeSignature") || "4/4",
    lyrics: formString(formData, "lyrics"),
    youtubeUrl: formString(formData, "youtubeUrl"),
    album: formString(formData, "album"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("songs.create");
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "songs") };
  }

  const { data, error } = await context.supabase
    .from("songs")
    .insert({
      team_id: context.teamId,
      title: parsed.data.title,
      artist: parsed.data.artist,
      original_key: parsed.data.originalKey,
      bpm: parsed.data.bpm,
      time_signature: parsed.data.timeSignature,
      lyrics_chords: parsed.data.lyrics,
      youtube_url: parsed.data.youtubeUrl || null,
      album: parsed.data.album || null,
      tags: [],
      status: "approved",
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: "Song could not be created." };
  }

  revalidatePath("/songs");
  redirect(`/songs/${data.id}`);
}

export async function updateSongAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const songId = formString(formData, "songId");
  const parsed = songInputSchema.safeParse({
    title: formString(formData, "title"),
    artist: formString(formData, "artist"),
    originalKey: formString(formData, "originalKey"),
    bpm: formData.get("bpm"),
    timeSignature: formString(formData, "timeSignature") || "4/4",
    lyrics: formString(formData, "lyrics"),
    youtubeUrl: formString(formData, "youtubeUrl"),
    album: formString(formData, "album"),
  });

  if (!songId) {
    return { ok: false, message: "Song id is missing." };
  }

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("songs.edit");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase
    .from("songs")
    .update({
      title: parsed.data.title,
      artist: parsed.data.artist,
      original_key: parsed.data.originalKey,
      bpm: parsed.data.bpm,
      time_signature: parsed.data.timeSignature,
      lyrics_chords: parsed.data.lyrics,
      youtube_url: parsed.data.youtubeUrl || null,
      album: parsed.data.album || null,
    })
    .eq("id", songId)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Song could not be saved." };
  }

  revalidatePath("/songs");
  revalidatePath(`/songs/${songId}`);
  return { ok: true, message: "Song saved." };
}

export async function submitFeedbackAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = feedbackInputSchema.safeParse({
    reportType: formString(formData, "reportType"),
    title: formString(formData, "title"),
    description: formString(formData, "description"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return context.state;
  }

  const pageUrl = formString(formData, "pageUrl").slice(0, 500);

  const { error } = await context.supabase.from("feedback_reports").insert({
    team_id: context.teamId,
    profile_id: context.userId,
    report_type: parsed.data.reportType,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    page_url: pageUrl,
  });

  if (error) {
    return { ok: false, message: "Report could not be submitted." };
  }

  return { ok: true, message: "Report submitted. Thank you!" };
}

export async function deleteEventAction(formData: FormData): Promise<ActionState> {
  const eventId = formData.get("eventId") as string;
  if (!eventId) {
    return { ok: false, message: "Event ID is required." };
  }

  const context = await getMutationContext("events.manage");
  if (!context.ok) {
    return context.state;
  }

  try {
    const { data: event } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) {
      return { ok: false, message: "Event not found." };
    }

    await context.supabase.from("attendance").delete().eq("event_id", eventId);
    await context.supabase.from("event_assignments").delete().eq("event_id", eventId);

    const { data: linkedSetlist } = await context.supabase
      .from("setlists")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (linkedSetlist) {
      await context.supabase.from("setlist_songs").delete().eq("setlist_id", linkedSetlist.id);
      await context.supabase.from("setlists").delete().eq("id", linkedSetlist.id);
    }

    const { error } = await context.supabase.from("events").delete().eq("id", eventId);

    if (error) {
      return { ok: false, message: "Could not delete event: " + error.message };
    }
  } catch (e: any) {
    return { ok: false, message: "Database deletion failed: " + (e.message || e) };
  }

  revalidatePath("/events");
  redirect("/events");
}
