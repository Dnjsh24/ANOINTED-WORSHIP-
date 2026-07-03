export type SetlistAssignmentSummary = {
  assignment: string;
  memberId?: string | null;
  memberName?: string | null;
};

export type MissingSetlistRole = {
  group: "Leadership" | "Band" | "Vocals" | "Dance";
  label: string;
  assigned: number;
  required: number;
};

export type EventWindow = {
  id: string;
  name: string;
  date: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type AssignmentConflict = {
  memberId: string;
  memberName: string;
  currentRole: string;
  conflictingRole: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
};

const requiredSetlistRoles: Array<{
  assignment: string;
  label: string;
  group: MissingSetlistRole["group"];
  required: number;
}> = [
  { assignment: "Worship Leader", label: "Worship Leader", group: "Leadership", required: 1 },
  { assignment: "Main Keys", label: "Keys", group: "Band", required: 1 },
  { assignment: "Acoustic Guitar", label: "Acoustic Guitar", group: "Band", required: 1 },
  { assignment: "Electric Guitar", label: "Electric Guitar", group: "Band", required: 1 },
  { assignment: "Bass", label: "Bass", group: "Band", required: 1 },
  { assignment: "Drums", label: "Drums", group: "Band", required: 1 },
  { assignment: "Backup Singer", label: "Singer", group: "Vocals", required: 1 },
  { assignment: "Dancers", label: "Dancer", group: "Dance", required: 1 },
];

export function getMissingSetlistRoles(assignments: SetlistAssignmentSummary[]): MissingSetlistRole[] {
  const assignedCounts = assignments.reduce<Record<string, number>>((counts, item) => {
    if (!item.memberId) return counts;
    return {
      ...counts,
      [item.assignment]: (counts[item.assignment] ?? 0) + 1,
    };
  }, {});

  return requiredSetlistRoles
    .map((role) => ({
      group: role.group,
      label: role.label,
      assigned: assignedCounts[role.assignment] ?? 0,
      required: role.required,
    }))
    .filter((role) => role.assigned < role.required);
}

export function getEventTimeLabel(event: EventWindow) {
  const startsAt = formatTime(event.startsAt);
  const endsAt = formatTime(event.endsAt);

  if (startsAt && endsAt) return `${startsAt} - ${endsAt}`;
  if (startsAt) return startsAt;
  return "Time TBD";
}

export function eventWindowsOverlap(current: EventWindow, other: EventWindow) {
  if (current.date !== other.date) return false;

  const currentStart = timeToMinutes(current.startsAt) ?? 0;
  const otherStart = timeToMinutes(other.startsAt) ?? 0;
  const currentEnd = timeToMinutes(current.endsAt) ?? currentStart + 180;
  const otherEnd = timeToMinutes(other.endsAt) ?? otherStart + 180;

  return currentStart < otherEnd && otherStart < currentEnd;
}

export function buildAssignmentConflicts({
  currentEvent,
  currentAssignments,
  otherAssignments,
}: {
  currentEvent: EventWindow;
  currentAssignments: SetlistAssignmentSummary[];
  otherAssignments: Array<SetlistAssignmentSummary & { event: EventWindow }>;
}): AssignmentConflict[] {
  const currentByMember = new Map(
    currentAssignments
      .filter((assignment) => assignment.memberId)
      .map((assignment) => [assignment.memberId, assignment]),
  );

  return otherAssignments.reduce<AssignmentConflict[]>((conflicts, other) => {
    if (!other.memberId || !eventWindowsOverlap(currentEvent, other.event)) {
      return conflicts;
    }

    const current = currentByMember.get(other.memberId);
    if (!current) {
      return conflicts;
    }

    return [
      ...conflicts,
      {
        memberId: other.memberId,
        memberName: current.memberName ?? other.memberName ?? "Assigned member",
        currentRole: current.assignment,
        conflictingRole: other.assignment,
        eventName: other.event.name,
        eventDate: other.event.date,
        eventTime: getEventTimeLabel(other.event),
      },
    ];
  }, []);
}

function timeToMinutes(value?: string | null) {
  if (!value) return undefined;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(value?: string | null) {
  const minutes = timeToMinutes(value);
  if (minutes === undefined) return "";

  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  const date = new Date(2026, 0, 1, hours, minutePart);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
