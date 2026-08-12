import { getEventTypeLabel, isServiceBasedEventType } from "@/lib/domain/event-types";
import type { LinkedEventContext, Setlist } from "@/lib/types";

export type SetlistWithEvent = Setlist & { linkedEvent: LinkedEventContext | null };

export function getLinkedEventLabel(event: LinkedEventContext) {
  const typeLabel = getEventTypeLabel(event.type);
  return isServiceBasedEventType(event.type) && event.serviceType
    ? `${typeLabel} - ${event.serviceType}`
    : typeLabel;
}

export function getVisibleSetlistMetadata(setlist: SetlistWithEvent) {
  if (!setlist.linkedEvent) return null;

  return {
    date: setlist.linkedEvent.date,
    location: setlist.linkedEvent.location,
    serviceLabel: getLinkedEventLabel(setlist.linkedEvent),
    worshipLeader: setlist.linkedEvent.worshipLeader,
  };
}

export function getSetlistGroups(setlists: SetlistWithEvent[], referenceDate: string) {
  const standalone: SetlistWithEvent[] = [];
  const upcoming: SetlistWithEvent[] = [];
  const past: SetlistWithEvent[] = [];

  for (const setlist of setlists) {
    if (!setlist.linkedEvent) {
      standalone.push(setlist);
    } else if (setlist.linkedEvent.date >= referenceDate) {
      upcoming.push(setlist);
    } else {
      past.push(setlist);
    }
  }

  standalone.sort((left, right) => left.name.localeCompare(right.name));
  upcoming.sort((left, right) => left.linkedEvent!.date.localeCompare(right.linkedEvent!.date));
  past.sort((left, right) => right.linkedEvent!.date.localeCompare(left.linkedEvent!.date));

  return { standalone, upcoming, past };
}
