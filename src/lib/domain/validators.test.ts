import { describe, expect, it } from "vitest";
import {
  announcementInputSchema,
  eventInputSchema,
  inviteMemberSchema,
  joinCodeSchema,
  messageSchema,
  profileInputSchema,
  reminderInputSchema,
  serviceTemplateInputSchema,
  setlistInputSchema,
  songInputSchema,
} from "@/lib/domain/validators";

describe("validators", () => {
  it("accepts team codes", () => {
    expect(joinCodeSchema.parse("dm-10001")).toBe("DM-10001");
  });

  it("rejects invalid team codes", () => {
    expect(() => joinCodeSchema.parse("bad-code")).toThrow();
  });

  it("validates song input boundaries", () => {
    expect(
      songInputSchema.parse({
        title: "Closing Song",
        artist: "Demo Writer",
        originalKey: "F",
        bpm: "66",
        timeSignature: "4/4",
        lyrics: "F\nSample lyric",
      }),
    ).toMatchObject({ bpm: 66 });
  });

  it("validates setlist forms with required ministry scheduling fields", () => {
    expect(
      setlistInputSchema.parse({
        title: "Sunday Worship",
        serviceDate: "2026-07-12",
        serviceType: "Service",
        location: "Main Sanctuary",
        callTime: "08:00",
        rehearsalTime: "08:15",
        worshipLeader: "Alex Morgan",
      }),
    ).toMatchObject({ title: "Sunday Worship", location: "Main Sanctuary" });

    expect(() =>
      setlistInputSchema.parse({
        title: "",
        serviceDate: "",
        location: "",
        callTime: "",
        rehearsalTime: "",
        worshipLeader: "",
      }),
    ).toThrow();
  });

  it("validates event and invite forms", () => {
    expect(
      eventInputSchema.parse({
        title: "Band Rehearsal",
        eventType: "rehearsal",
        date: "2026-07-09",
        startTime: "19:00",
        location: "Room A",
      }),
    ).toMatchObject({ eventType: "rehearsal" });

    expect(inviteMemberSchema.parse({ email: "casey.member@example.com", role: "member" })).toMatchObject({
      email: "casey.member@example.com",
      role: "member",
    });
    expect(() => inviteMemberSchema.parse({ email: "bad", role: "visitor" })).toThrow();
  });

  it("does not accept profile role changes from personal settings", () => {
    const parsed = profileInputSchema.parse({
      fullName: "Dan Jeshua",
      primaryRole: "Member",
      accessLevel: "owner",
      avatarUrl: "",
    });

    expect(parsed).not.toHaveProperty("accessLevel");
  });

  it("validates optional message attachments", () => {
    expect(
      messageSchema.parse({
        channelId: "worship-team",
        body: "Please review this chart.",
        attachmentFileId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ attachmentFileId: "11111111-1111-4111-8111-111111111111" });

    expect(() =>
      messageSchema.parse({
        channelId: "worship-team",
        body: "Bad attachment",
        attachmentFileId: "not-a-file-id",
      }),
    ).toThrow();
  });

  it("validates recurring service templates", () => {
    expect(
      serviceTemplateInputSchema.parse({
        name: "Sunday Morning Service",
        serviceType: "Sunday Worship",
        location: "Main Sanctuary",
        callTime: "08:00",
        rehearsalTime: "08:30",
        reminderFrequency: "weekly",
        reminderOccurrences: "4",
        backupSingers: ["member-a", "member-b"],
        dancers: ["member-c"],
      }),
    ).toMatchObject({
      name: "Sunday Morning Service",
      reminderFrequency: "weekly",
      reminderOccurrences: 4,
    });

    expect(() =>
      serviceTemplateInputSchema.parse({
        name: "",
        serviceType: "Sunday Worship",
        location: "Main Sanctuary",
        callTime: "08:00",
        rehearsalTime: "08:30",
        reminderOccurrences: 99,
      }),
    ).toThrow();
  });

  it("validates notice priority, tags, and recurrence", () => {
    expect(
      announcementInputSchema.parse({
        title: "Room changed",
        category: "Urgent",
        body: "Rehearsal moved to room 2.",
        priority: "urgent",
        target: { targetType: "role", targetRole: "band_member" },
      }),
    ).toMatchObject({ priority: "urgent" });

    expect(
      reminderInputSchema.parse({
        title: "Upload charts",
        body: "Please upload files before rehearsal.",
        priority: "important",
        recurrence: "weekly",
        occurrences: "4",
        target: { targetType: "all" },
      }),
    ).toMatchObject({ recurrence: "weekly", occurrences: 4 });

    expect(() =>
      reminderInputSchema.parse({
        title: "Too many",
        body: "Nope",
        recurrence: "weekly",
        occurrences: 99,
        target: { targetType: "all" },
      }),
    ).toThrow();
  });
});
