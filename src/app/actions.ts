"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { can } from "@/lib/domain/rbac";
import { generateTeamCode } from "@/lib/domain/team-code";
import {
  attendanceSchema,
  eventInputSchema,
  inviteMemberSchema,
  joinCodeSchema,
  memberRoleSchema,
  messageSchema,
  profileInputSchema,
  setlistInputSchema,
  setlistSongInputSchema,
  songInputSchema,
  teamNameSchema,
  teamSettingsSchema,
} from "@/lib/domain/validators";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/domain/rbac";
import type { TeamRole } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

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

async function getMutationContext(permission?: Permission): Promise<
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

  const { data: membership } = await supabase
    .from("team_members")
    .select("id, team_id, role, status")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

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
  revalidatePath("/profile");
  revalidatePath("/admin/settings");
  revalidatePath("/songs");
}

export async function signInWithGoogle() {
  if (!hasSupabaseEnv()) {
    redirect("/teams");
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
    redirect("/teams");
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

  if (!hasSupabaseEnv()) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = user?.id;

  if (!profileId) {
    redirect("/login");
  }

  let createdTeamId: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const teamId = randomUUID();
    const code = generateTeamCode(name, `${profileId}:${teamId}:${attempt}`);
    const { error } = await supabase.from("teams").insert({ id: teamId, name, code, owner_id: profileId });

    if (!error) {
      createdTeamId = teamId;
      break;
    }

    if (error.code !== "23505") {
      redirect("/teams/new?error=create");
    }
  }

  if (!createdTeamId) {
    redirect("/teams/new?error=code");
  }

  const { error: memberError } = await supabase.from("team_members").insert({
    team_id: createdTeamId,
    profile_id: profileId,
    role: "owner",
    status: "active",
    ministry: "Worship Leader",
  });

  if (memberError) {
    redirect("/teams/new?error=member");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function joinTeamAction(formData: FormData) {
  joinCodeSchema.parse(formData.get("code"));

  if (!hasSupabaseEnv()) {
    redirect("/pending");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = user?.id;

  if (!profileId) {
    redirect("/login");
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
    }
  }

  const code = joinCodeSchema.parse(formData.get("code"));
  const roleInput = formData.get("role") as string;
  const requestedRole = (["member", "worship_leader", "band_member", "media", "dancer", "pastor"].includes(roleInput)
    ? roleInput
    : "member") as TeamRole;

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
    let ministry = "Worship Leader";
    if (roleInput === "band_member") {
      ministry = "Electric Guitarist";
    } else if (roleInput === "worship_leader") {
      ministry = "Worship Leader";
    } else if (roleInput === "media") {
      ministry = "Media & Tech";
    } else if (roleInput === "dancer") {
      ministry = "Dance Ministry";
    } else if (roleInput === "pastor") {
      ministry = "Pastor";
    } else if (roleInput === "member") {
      ministry = "Backup Singer";
    }

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

function formatTime(timeStr: string): string {
  if (!timeStr) return "09:00:00";
  if (timeStr.split(":").length === 3) return timeStr;
  return `${timeStr}:00`;
}

export async function createSetlistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setlistInputSchema.safeParse({
    title: formString(formData, "title"),
    serviceDate: formString(formData, "serviceDate"),
    serviceType: formString(formData, "serviceType") || "Service",
    location: formString(formData, "location"),
    callTime: formString(formData, "callTime"),
    rehearsalTime: formString(formData, "rehearsalTime"),
    worshipLeader: formString(formData, "worshipLeader"),
    notes: formString(formData, "notes"),
    acousticGuitar: formString(formData, "acousticGuitar"),
    electricGuitar: formString(formData, "electricGuitar"),
    bass: formString(formData, "bass"),
    drums: formString(formData, "drums"),
    mainKeys: formString(formData, "mainKeys"),
    secondKeys: formString(formData, "secondKeys"),
    backupSingers: formData.getAll("backupSingers").map(String).filter(Boolean),
    media: formString(formData, "media"),
    dancers: formString(formData, "dancers"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "setlists") };
  }

  // 1. Resolve or Create the associated event
  let resolvedEventId = formString(formData, "eventId");

  if (resolvedEventId) {
    const { error: updateError } = await context.supabase
      .from("events")
      .update({
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: formatTime(parsed.data.callTime),
        call_time: formatTime(parsed.data.callTime),
        rehearsal_time: formatTime(parsed.data.rehearsalTime),
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
        type: "service",
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: formatTime(parsed.data.callTime),
        call_time: formatTime(parsed.data.callTime),
        rehearsal_time: formatTime(parsed.data.rehearsalTime),
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
      service_times: [parsed.data.serviceType],
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

  // 3. Save roles/assignments
  const assignmentsToInsert: any[] = [];
  if (parsed.data.worshipLeader) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.worshipLeader, assignment: "Worship Leader" });
  }
  if (parsed.data.acousticGuitar) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.acousticGuitar, assignment: "Acoustic Guitar" });
  }
  if (parsed.data.electricGuitar) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.electricGuitar, assignment: "Electric Guitar" });
  }
  if (parsed.data.bass) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.bass, assignment: "Bass" });
  }
  if (parsed.data.drums) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.drums, assignment: "Drums" });
  }
  if (parsed.data.mainKeys) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.mainKeys, assignment: "Main Keys" });
  }
  if (parsed.data.secondKeys) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.secondKeys, assignment: "Second Keys" });
  }
  if (parsed.data.media) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.media, assignment: "Media" });
  }
  if (parsed.data.dancers) {
    assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: parsed.data.dancers, assignment: "Dancers" });
  }
  if (parsed.data.backupSingers) {
    for (const singerId of parsed.data.backupSingers) {
      if (singerId) {
        assignmentsToInsert.push({ event_id: resolvedEventId, team_member_id: singerId, assignment: "Backup Singer" });
      }
    }
  }

  if (assignmentsToInsert.length > 0) {
    await (context.supabase.from("event_assignments") as any).insert(assignmentsToInsert);
  }

  revalidatePath("/setlists");
  redirect(`/setlists/${setlistData.id}`);
}

export async function updateSetlistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const id = formString(formData, "setlistId");
  const parsed = setlistInputSchema.safeParse({
    title: formString(formData, "title"),
    serviceDate: formString(formData, "serviceDate"),
    serviceType: formString(formData, "serviceType") || "Service",
    location: formString(formData, "location"),
    callTime: formString(formData, "callTime"),
    rehearsalTime: formString(formData, "rehearsalTime"),
    worshipLeader: formString(formData, "worshipLeader"),
    notes: formString(formData, "notes"),
    acousticGuitar: formString(formData, "acousticGuitar"),
    electricGuitar: formString(formData, "electricGuitar"),
    bass: formString(formData, "bass"),
    drums: formString(formData, "drums"),
    mainKeys: formString(formData, "mainKeys"),
    secondKeys: formString(formData, "secondKeys"),
    backupSingers: formData.getAll("backupSingers").map(String).filter(Boolean),
    media: formString(formData, "media"),
    dancers: formString(formData, "dancers"),
  });

  if (!id) {
    return { ok: false, message: "Setlist id is missing." };
  }

  if (!parsed.success) {
    return validationState(parsed.error);
  }

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
        type: "service",
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: formatTime(parsed.data.callTime),
        call_time: formatTime(parsed.data.callTime),
        rehearsal_time: formatTime(parsed.data.rehearsalTime),
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
        name: parsed.data.title,
        event_date: parsed.data.serviceDate,
        starts_at: formatTime(parsed.data.callTime),
        call_time: formatTime(parsed.data.callTime),
        rehearsal_time: formatTime(parsed.data.rehearsalTime),
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
      service_times: [parsed.data.serviceType],
      leader_member_id: parsed.data.worshipLeader,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", id)
    .eq("team_id", context.teamId);

  if (error) {
    return { ok: false, message: "Setlist changes could not be saved." };
  }

  // Update roles/assignments
  if (eventId) {
    await (context.supabase.from("event_assignments") as any).delete().eq("event_id", eventId);

    const assignmentsToInsert: any[] = [];
    if (parsed.data.worshipLeader) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.worshipLeader, assignment: "Worship Leader" });
    }
    if (parsed.data.acousticGuitar) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.acousticGuitar, assignment: "Acoustic Guitar" });
    }
    if (parsed.data.electricGuitar) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.electricGuitar, assignment: "Electric Guitar" });
    }
    if (parsed.data.bass) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.bass, assignment: "Bass" });
    }
    if (parsed.data.drums) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.drums, assignment: "Drums" });
    }
    if (parsed.data.mainKeys) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.mainKeys, assignment: "Main Keys" });
    }
    if (parsed.data.secondKeys) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.secondKeys, assignment: "Second Keys" });
    }
    if (parsed.data.media) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.media, assignment: "Media" });
    }
    if (parsed.data.dancers) {
      assignmentsToInsert.push({ event_id: eventId, team_member_id: parsed.data.dancers, assignment: "Dancers" });
    }
    if (parsed.data.backupSingers) {
      for (const singerId of parsed.data.backupSingers) {
        if (singerId) {
          assignmentsToInsert.push({ event_id: eventId, team_member_id: singerId, assignment: "Backup Singer" });
        }
      }
    }

    if (assignmentsToInsert.length > 0) {
      await (context.supabase.from("event_assignments") as any).insert(assignmentsToInsert);
    }
  }

  revalidatePath("/setlists");
  revalidatePath(`/setlists/${id}`);
  return { ok: true, message: "Setlist saved." };
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

  const { error } = await context.supabase.from("setlist_songs").insert({
    setlist_id: parsed.data.setlistId,
    song_id: parsed.data.songId,
    song_order: (count ?? 0) + 1,
    assigned_key: parsed.data.assignedKey,
    notes: parsed.data.lead ? `Lead: ${parsed.data.lead}` : null,
  });

  if (error) {
    return { ok: false, message: "Song could not be added to the setlist." };
  }

  revalidatePath(`/setlists/${parsed.data.setlistId}`);
  redirect(`/setlists/${parsed.data.setlistId}`);
}

export async function removeSetlistSongAction(formData: FormData): Promise<ActionState> {
  const setlistId = formString(formData, "setlistId");
  const slotId = formString(formData, "slotId");

  const context = await getMutationContext("setlists.manage");
  if (!context.ok) {
    return context.state;
  }

  const { error } = await context.supabase.from("setlist_songs").delete().eq("id", slotId);
  if (error) {
    return { ok: false, message: "Song could not be removed." };
  }

  revalidatePath(`/setlists/${setlistId}`);
  return { ok: true, message: "Song removed." };
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

  const { error } = await context.supabase.from("setlist_songs").update({ song_order: nextOrder.data }).eq("id", slotId);
  if (error) {
    return { ok: false, message: "Song order could not be updated." };
  }

  revalidatePath(`/setlists/${setlistId}`);
  return { ok: true, message: "Song order updated." };
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
  return { ok: true, message: `Marked ${parsed.data.status}.` };
}

export async function createEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventInputSchema.safeParse({
    title: formString(formData, "title"),
    eventType: formString(formData, "eventType"),
    date: formString(formData, "date"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    location: formString(formData, "location"),
    assignedTeams: formString(formData, "assignedTeams"),
    linkedSetlistId: formString(formData, "linkedSetlistId"),
    notes: formString(formData, "notes"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("events.manage");
  if (!context.ok) {
    return { ...context.state, message: context.state.message.replace("changes", "events") };
  }

  const { data, error } = await context.supabase
    .from("events")
    .insert({
      team_id: context.teamId,
      name: parsed.data.title,
      type: parsed.data.eventType,
      event_date: parsed.data.date,
      starts_at: parsed.data.startTime,
      ends_at: parsed.data.endTime || null,
      location: parsed.data.location,
      description: parsed.data.notes || parsed.data.assignedTeams || null,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: "Event could not be created." };
  }

  if (parsed.data.linkedSetlistId) {
    await context.supabase
      .from("setlists")
      .update({ event_id: data.id })
      .eq("id", parsed.data.linkedSetlistId);
  }

  revalidatePath("/events");
  redirect(`/events/${data.id}`);
}

export async function sendMessageAction(formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    channelId: formData.get("channelId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext("messages.send");
  if (!context.ok) {
    return { ok: false, message: "Sign in with Supabase to send messages." };
  }

  const { error } = await context.supabase.from("messages").insert({
    channel_id: parsed.data.channelId,
    sender_member_id: context.memberId,
    body: parsed.data.body,
  });

  if (error) {
    return { ok: false, message: "Message could not be sent." };
  }

  revalidatePath("/messages");
  return { ok: true, message: "Message sent." };
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

export async function reviewJoinRequestAction(formData: FormData) {
  const requestId = z.string().min(1).parse(formData.get("requestId"));
  const decision = z.enum(["approved", "rejected"]).parse(formData.get("decision"));

  const context = await getMutationContext("join_requests.review");
  if (!context.ok) {
    revalidatePath("/members");
    return;
  }

  const { data: request } = await context.supabase
    .from("join_requests")
    .select("team_id, profile_id, requested_role")
    .eq("id", requestId)
    .eq("team_id", context.teamId)
    .maybeSingle();

  await context.supabase
    .from("join_requests")
    .update({ status: decision, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("team_id", context.teamId);

  if (decision === "approved" && request) {
    await context.supabase.from("team_members").upsert(
      {
        team_id: request.team_id,
        profile_id: request.profile_id,
        role: request.requested_role,
        status: "active",
      },
      { onConflict: "team_id,profile_id" },
    );
  }

  revalidatePath("/members");
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
    accessLevel: formString(formData, "accessLevel"),
    avatarUrl: formString(formData, "avatarUrl"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const context = await getMutationContext();
  if (!context.ok) {
    return { ...context.state, message: "Profile save requires sign-in." };
  }

  const { error: profileError } = await context.supabase.from("profiles").update({ 
    full_name: parsed.data.fullName,
    avatar_url: parsed.data.avatarUrl || null
  }).eq("id", context.userId);
  const { error: memberError } = await context.supabase
    .from("team_members")
    .update({ ministry: parsed.data.primaryRole, role: parsed.data.accessLevel })
    .eq("id", context.memberId);

  if (profileError || memberError) {
    return { ok: false, message: "Profile could not be saved." };
  }

  revalidatePath("/profile");
  revalidatePath("/members");
  return { ok: true, message: "Profile saved." };
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

  const context = await getMutationContext("team.manage");
  if (!context.ok) {
    return { ...context.state, message: "Deleting a team requires being logged in." };
  }

  if (context.role !== "owner") {
    return { ok: false, message: "Only the team owner is authorized to delete the team." };
  }

  try {
    // 1. Delete event attendance records
    const { data: dbEvents } = await context.supabase.from("events").select("id").eq("team_id", context.teamId);
    const eventIds = dbEvents?.map((e) => e.id) || [];
    if (eventIds.length > 0) {
      await context.supabase.from("attendance").delete().in("event_id", eventIds);
    }

    // 2. Delete member attendance records
    const { data: dbMembers } = await context.supabase.from("team_members").select("id").eq("team_id", context.teamId);
    const memberIds = dbMembers?.map((m) => m.id) || [];
    if (memberIds.length > 0) {
      await context.supabase.from("attendance").delete().in("team_member_id", memberIds);
    }

    // 3. Delete setlist songs
    const { data: dbSetlists } = await context.supabase.from("setlists").select("id").eq("team_id", context.teamId);
    const setlistIds = dbSetlists?.map((s) => s.id) || [];
    if (setlistIds.length > 0) {
      await context.supabase.from("setlist_songs").delete().in("setlist_id", setlistIds);
    }

    // 4. Delete parent associations and dependent tables
    await context.supabase.from("team_settings").delete().eq("team_id", context.teamId);
    await context.supabase.from("message_channels").delete().eq("team_id", context.teamId);
    await context.supabase.from("announcements").delete().eq("team_id", context.teamId);
    await context.supabase.from("monthly_schedules").delete().eq("team_id", context.teamId);
    await context.supabase.from("dance_notes").delete().eq("team_id", context.teamId);
    await context.supabase.from("practice_files").delete().eq("team_id", context.teamId);
    await context.supabase.from("prayer_requests").delete().eq("team_id", context.teamId);
    await context.supabase.from("songs").delete().eq("team_id", context.teamId);
    await context.supabase.from("events").delete().eq("team_id", context.teamId);
    await context.supabase.from("setlists").delete().eq("team_id", context.teamId);
    await context.supabase.from("join_requests").delete().eq("team_id", context.teamId);
    await context.supabase.from("team_members").delete().eq("team_id", context.teamId);

    // 5. Delete the team itself
    const { error } = await context.supabase
      .from("teams")
      .delete()
      .eq("id", context.teamId);

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

  const context = await getMutationContext();
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
        location: settings?.default_service_location || "Austin, TX",
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
