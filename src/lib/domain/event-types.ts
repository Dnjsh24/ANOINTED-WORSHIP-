import type { EventType } from "@/lib/types";

export const DEFAULT_SERVICE_TYPE = "Sunday Worship";

export const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: "service", label: "Service" },
  { value: "special_event", label: "Special Event" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "meeting", label: "Meeting" },
  { value: "service_rehearsal", label: "Service + Rehearsal" },
];

export const SERVICE_TYPE_OPTIONS = [
  DEFAULT_SERVICE_TYPE,
  "Sunday Evening Worship",
  "Youth Service",
  "Prayer Service",
  "Communion Service",
] as const;

export function isServiceBasedEventType(eventType?: EventType | null) {
  return eventType === "service" || eventType === "service_rehearsal";
}

export function getEventTypeLabel(eventType?: EventType | null) {
  switch (eventType) {
    case "service":
      return "Service";
    case "special_event":
      return "Special Event";
    case "rehearsal":
      return "Rehearsal";
    case "meeting":
      return "Meeting";
    case "service_rehearsal":
      return "Service + Rehearsal";
    default:
      return "Service";
  }
}

export function getPrimaryServiceType(serviceTimes?: string[] | null) {
  return serviceTimes?.find((value) => value.trim().length > 0) ?? "";
}

export function resolveSetlistEventType(eventType?: EventType | null, serviceTimes?: string[] | null): EventType {
  if (eventType) {
    return eventType;
  }

  if ((serviceTimes ?? []).length > 0) {
    return "service";
  }

  return "service";
}

export function getSetlistTypeLabel(input: { eventType?: EventType | null; serviceTimes?: string[] | null }) {
  const resolvedEventType = resolveSetlistEventType(input.eventType, input.serviceTimes);

  if (isServiceBasedEventType(resolvedEventType)) {
    const serviceType = getPrimaryServiceType(input.serviceTimes);
    return serviceType ? `${getEventTypeLabel(resolvedEventType)} - ${serviceType}` : getEventTypeLabel(resolvedEventType);
  }

  return getEventTypeLabel(resolvedEventType);
}

export function normalizeSetlistServiceTimes(eventType: EventType, serviceType?: string | null) {
  const trimmedServiceType = serviceType?.trim();

  if (!isServiceBasedEventType(eventType) || !trimmedServiceType) {
    return [];
  }

  return [trimmedServiceType];
}
