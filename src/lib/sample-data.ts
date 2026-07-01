import type {
  Announcement,
  Event,
  Message,
  Setlist,
  Song,
  TeamMember,
} from "@/lib/types";

export const appName = "Anointed Worship";
export const teamCode = "DM-10001";

export const currentUser = {
  id: "profile-alex",
  fullName: "Alex",
  email: "alex.member@example.com",
};

export const songs: Song[] = [
  {
    id: "opening-song",
    title: "Opening Song",
    artist: "Demo Writer",
    originalKey: "B",
    currentKey: "B",
    bpm: 90,
    timeSignature: "4/4",
    tags: ["Praise", "Upbeat"],
    favorite: true,
    sections: [
      {
        label: "Verse 1",
        lines: [
          { chords: "B", lyric: "Opening line for the demo verse" },
          { chords: "E", lyric: "Second line for the demo verse" },
        ],
      },
      {
        label: "Chorus",
        lines: [
          { chords: "B", lyric: "Sample chorus line one" },
          { chords: "G#m E", lyric: "Sample chorus line two" },
        ],
      },
    ],
  },
  {
    id: "reflection-song",
    title: "Reflection Song",
    artist: "Demo Writer",
    originalKey: "D",
    currentKey: "D",
    bpm: 68,
    timeSignature: "4/4",
    tags: ["Worship", "Ballad"],
    favorite: false,
    sections: [
      {
        label: "Verse 1",
        lines: [
          { chords: "D", lyric: "Quiet line for the reflection verse" },
          { chords: "G Bm A", lyric: "Second reflection line for demo use" },
        ],
      },
    ],
  },
  {
    id: "acoustic-response",
    title: "Acoustic Response",
    artist: "Demo Writer",
    originalKey: "A",
    currentKey: "A",
    bpm: 72,
    timeSignature: "6/8",
    tags: ["Worship", "Acoustic"],
    favorite: true,
    sections: [
      {
        label: "Chorus",
        lines: [
          { chords: "A", lyric: "Sample response line one" },
          { chords: "D", lyric: "Sample response line two" },
        ],
      },
    ],
  },
  {
    id: "build-song",
    title: "Build Song",
    artist: "Demo Writer",
    originalKey: "D",
    currentKey: "D",
    bpm: 130,
    timeSignature: "4/4",
    tags: ["Anthem", "Build"],
    favorite: false,
    sections: [
      {
        label: "Bridge",
        lines: [
          { chords: "Bm", lyric: "Sample bridge line one" },
          { chords: "G D A", lyric: "Sample bridge line two" },
        ],
      },
    ],
  },
  {
    id: "response-song",
    title: "Response Song",
    artist: "Demo Writer",
    originalKey: "G",
    currentKey: "G",
    bpm: 70,
    timeSignature: "4/4",
    tags: ["Worship", "Response"],
    favorite: true,
    sections: [
      {
        label: "Chorus",
        lines: [
          { chords: "G", lyric: "Sample closing line one" },
          { chords: "C", lyric: "Sample closing line two" },
        ],
      },
    ],
  },
  {
    id: "closing-song",
    title: "Closing Song",
    artist: "Demo Writer",
    originalKey: "F",
    currentKey: "F",
    bpm: 66,
    timeSignature: "4/4",
    tags: ["Declaration", "Anthem"],
    favorite: false,
    sections: [
      {
        label: "Chorus",
        lines: [
          { chords: "F", lyric: "Sample declaration line one" },
          { chords: "C G Am", lyric: "Sample declaration line two" },
        ],
      },
    ],
  },
  {
    id: "classic-song",
    title: "Classic Song",
    artist: "Demo Writer",
    originalKey: "G",
    currentKey: "G",
    bpm: 76,
    timeSignature: "4/4",
    tags: ["Classic", "Worship"],
    favorite: true,
    sections: [
      {
        label: "Verse 1",
        lines: [
          { chords: "G Em", lyric: "Sample classic line one" },
          { chords: "C", lyric: "Sample classic line two" },
          { chords: "D", lyric: "Sample classic line three" },
          { lyric: "Sample classic line four" },
        ],
      },
      {
        label: "Chorus",
        lines: [
          { chords: "G", lyric: "Sample chorus line one" },
          { chords: "Em", lyric: "Sample chorus line two" },
          { chords: "C", lyric: "Sample chorus line three" },
          { chords: "D G", lyric: "Sample chorus line four" },
        ],
      },
    ],
  },
];

export const setlists: Setlist[] = [
  {
    id: "sunday-service",
    name: "Sunday Service",
    date: "2026-07-12",
    leader: "Alex M.",
    location: "Main Sanctuary",
    callTime: "8:00 AM",
    rehearsalTime: "8:15 AM",
    serviceTimes: ["9:00 AM", "11:00 AM"],
    songs: ["opening-song", "reflection-song", "acoustic-response", "build-song", "response-song"].map(
      (songId, index) => {
        const song = songs.find((item) => item.id === songId)!;
        return {
          id: `${songId}-slot`,
          song,
          order: index + 1,
          assignedKey: song.currentKey,
          lead: index === 0 ? "Alex" : index === 1 ? "Casey" : undefined,
          band: index < 2 ? ["Jordan", "Riley", "Taylor"] : [],
        };
      },
    ),
  },
  {
    id: "youth-night",
    name: "Youth Night",
    date: "2026-07-18",
    leader: "Casey J.",
    location: "Youth Hall",
    callTime: "5:30 PM",
    rehearsalTime: "6:00 PM",
    serviceTimes: ["7:00 PM"],
    songs: ["demo-song-one", "demo-song-two", "demo-song-three", "demo-song-four", "demo-song-five"].map((title, index) => {
      const song = songs[index % songs.length];
      return {
        id: `${title}-slot`,
        song: { ...song, id: title, title: title.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") },
        order: index + 1,
        assignedKey: ["C", "E", "Ab", "Gb", "Gb"][index],
      };
    }),
  },
  {
    id: "midweek-prayer",
    name: "Midweek Prayer",
    date: "2026-07-10",
    leader: "John K.",
    location: "Prayer Room",
    callTime: "6:30 PM",
    rehearsalTime: "6:45 PM",
    serviceTimes: ["7:00 PM"],
    songs: ["prayer-song-one", "prayer-song-two", "prayer-song-three", "prayer-song-four", "prayer-song-five"].map((title, index) => {
      const song = songs[(index + 1) % songs.length];
      return {
        id: `${title}-slot`,
        song: { ...song, id: title, title: title.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") },
        order: index + 1,
        assignedKey: ["C", "F", "Ab", "Eb", "G"][index],
      };
    }),
  },
];

export const announcements: Announcement[] = [
  {
    id: "soundboard",
    title: "New Soundboard Training",
    body: "Required for all audio techs this Wednesday.",
    category: "Media",
    createdBy: "Casey J.",
    createdAt: "2026-07-06T13:00:00Z",
  },
  {
    id: "rehearsal-move",
    title: "Rehearsal moved to 7 PM",
    body: "Youth event sound check needs the room first. See you then.",
    category: "Band",
    createdBy: "Casey J.",
    createdAt: "2026-07-05T16:00:00Z",
  },
];

export const events: Event[] = [
  {
    id: "event-sunday",
    name: "Sunday Morning Worship",
    type: "service",
    date: "2026-07-12",
    time: "09:00 AM - 12:30 PM",
    location: "Main Sanctuary",
    assignedTeams: ["Worship Band", "AV Team"],
    confirmed: 12,
    pending: 2,
  },
  {
    id: "event-rehearsal",
    name: "Midweek Band Rehearsal",
    type: "rehearsal",
    date: "2026-07-09",
    time: "07:00 PM - 09:00 PM",
    location: "Rehearsal Room A",
    assignedTeams: ["Worship Band"],
    confirmed: 6,
    pending: 1,
  },
  {
    id: "event-prayer",
    name: "Prayer Meeting",
    type: "meeting",
    date: "2026-07-11",
    time: "08:00 AM",
    location: "Prayer Room",
    assignedTeams: ["Leaders"],
    confirmed: 8,
    pending: 0,
  },
];

export const members: TeamMember[] = [
  {
    id: "member-alex",
    profile: { id: "profile-alex", fullName: "Alex Morgan", email: "alex.member@example.com" },
    role: "worship_leader",
    status: "active",
    attendanceRate: 98,
    ministry: "Worship Leader",
  },
  {
    id: "member-casey",
    profile: { id: "profile-casey", fullName: "Casey Lee", email: "casey.member@example.com" },
    role: "band_member",
    status: "active",
    attendanceRate: 92,
    ministry: "Keys",
  },
  {
    id: "member-jordan",
    profile: { id: "profile-jordan", fullName: "Jordan Reed", email: "jordan.member@example.com" },
    role: "band_member",
    status: "inactive",
    attendanceRate: 45,
    ministry: "Drums",
  },
];

export const pendingRequests = [
  { id: "request-casey", initials: "CL", name: "Casey Lee", ministry: "Vocals" },
  { id: "request-riley", initials: "RR", name: "Riley Ross", ministry: "Guitar" },
];

export const messages: Message[] = [
  {
    id: "msg-1",
    author: "Alex Morgan",
    body: "Hey team, I updated the demo chord chart and changed the key for rehearsal.",
    createdAt: "10:15 AM",
  },
  {
    id: "msg-2",
    author: "Alex Morgan",
    body: "Make sure to review the rehearsal notes before tonight.",
    createdAt: "10:30 AM",
  },
  {
    id: "msg-3",
    author: "You",
    body: "Got it. The transition into the bridge feels much better in B.",
    createdAt: "10:39 AM",
    mine: true,
  },
  {
    id: "msg-4",
    author: "Casey Lee",
    body: "The new bridge arrangement is ready for review.",
    createdAt: "11:42 AM",
  },
];
