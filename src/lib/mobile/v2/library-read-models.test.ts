import { describe, expect, it } from "vitest";
import { getSetlistReadModel, getSongReadModel, LibraryReadModelError } from "@/lib/mobile/v2/library-read-models";

describe("mobile library read models", () => {
  it("maps complete song chart fields, favorite state, and website play counts", () => {
    const song = getSongReadModel({
      id: "song-1",
      title: "Amazing Grace",
      artist: "Traditional",
      original_key: "G",
      bpm: 72,
      time_signature: "3/4",
      tags: ["hymn"],
      lyrics_chords: "[Verse 1]\n[G]Amazing grace",
      youtube_url: "https://youtube.test/watch?v=abc",
      spotify_url: null,
      image_url: null,
      album: null,
      setlist_songs: [{ count: 3 }],
    }, true);

    expect(song).toMatchObject({
      id: "song-1",
      currentKey: "G",
      favorite: true,
      playCount: 3,
      youtubeUrl: "https://youtube.test/watch?v=abc",
      sections: [{ label: "Verse 1", lines: [{ lyric: "Amazing grace", tokens: [{ chord: "G", lyric: "Amazing grace" }] }] }],
    });
    expect(song.spotifyUrl).toBeUndefined();
  });

  it("keeps website setlist defaults, event label, ordered slots, and named history", () => {
    const setlist = getSetlistReadModel(
      {
        id: "setlist-1",
        name: "Sunday Worship",
        setlist_date: "2026-10-18",
        location: null,
        call_time: null,
        rehearsal_time: "08:30:00",
        service_times: ["9:00 AM"],
        event_id: "event-1",
        leader_member_id: "member-1",
        created_by: "user-1",
        notes: "Setlist notes",
        presentation_settings: { theme: "dark" },
        events: [{ type: "service" }],
        leader: [{ profiles: [{ full_name: "Alex Leader" }] }],
      },
      [
        {
          id: "slot-later",
          song_order: 2,
          assigned_key: "D",
          notes: JSON.stringify({ lead: "Jordan" }),
          arrangement: "Acoustic",
          band_notes: "Start softly",
          lead_member_id: "member-2",
          youtube_url: "https://youtube.test/slot",
          slide_settings: { showChords: true },
          created_at: "2026-10-10T00:00:00Z",
          song: { id: "song-2", title: "Holy Holy", artist: "Alex", bpm: null, original_key: "C", time_signature: "4/4", tags: [], lyrics_chords: "[Chorus]\n[C]Holy", youtube_url: null },
        },
        {
          id: "slot-first",
          song_order: 1,
          assigned_key: "G",
          notes: null,
          arrangement: null,
          band_notes: null,
          lead_member_id: null,
          youtube_url: null,
          slide_settings: null,
          created_at: "2026-10-10T00:00:00Z",
          song: { id: "song-1", title: "Amazing Grace", artist: "Traditional", bpm: 72, original_key: "G", time_signature: "4/4", tags: [], lyrics_chords: "[Verse]\n[G]Grace", youtube_url: "https://youtube.test/watch?v=abc" },
        },
        { id: "slot-missing-song", song_order: 3, song: null },
      ],
      [
        { id: "history-old", change_type: "created", summary: "Created", changed_by: "user-1", created_at: "2026-10-10T00:00:00Z", snapshot: { name: "Old" } },
        { id: "history-new", change_type: "song_added", summary: "Added a song", changed_by: null, created_at: "2026-10-12T00:00:00Z", snapshot: { name: "New" } },
      ],
      new Map([["user-1", "Alex Leader"]]),
      new Map([["song-1", getSongReadModel({ id: "song-1", title: "Amazing Grace", artist: "Traditional", original_key: "G", bpm: 72, time_signature: "4/4", tags: [], lyrics_chords: "", setlist_songs: [{ count: 4 }] }, true)]]),
    );

    expect(setlist).toMatchObject({
      eventType: "service",
      leaderMemberId: "member-1",
      createdBy: "user-1",
      notes: "Setlist notes",
      presentationSettings: { theme: "dark" },
      eventLabel: "Service - 9:00 AM",
      leader: "Alex Leader",
      location: "Main Sanctuary",
      callTime: "09:00",
      rehearsalTime: "08:30",
      songs: [
        { id: "slot-first", order: 1, assignedKey: "G", song: { title: "Amazing Grace", artist: "Traditional", currentKey: "G", timeSignature: "4/4", tags: [], favorite: true } },
        { id: "slot-later", order: 2, lead: "Jordan", leadMemberId: "member-2", youtubeUrl: "https://youtube.test/slot", slideSettings: { showChords: true }, arrangement: "Acoustic", bandNotes: "Start softly", song: { title: "Holy Holy" } },
      ],
      history: [
        { id: "history-new", changeType: "song_added", changedBy: "System", snapshot: { name: "New" } },
        { id: "history-old", changeType: "created", changedBy: "Alex Leader", snapshot: { name: "Old" } },
      ],
    });
  });

  it("rejects malformed database values at the read-model boundary", () => {
    expect(() => getSongReadModel({ id: "song-1", title: "Song", lyrics_chords: "", original_key: "C", tags: "invalid" }, false))
      .toThrow(LibraryReadModelError);
  });
});
