import type { ReminderRecurrence, ServiceTemplate, ServiceTemplateRoles } from "@/lib/types";

export const fallbackServiceTemplates: ServiceTemplate[] = [
  {
    id: "template-sunday-morning",
    name: "Sunday Morning Service",
    serviceType: "Sunday Worship",
    location: "Main Sanctuary",
    callTime: "08:00",
    rehearsalTime: "08:30",
    reminderFrequency: "weekly",
    reminderOccurrences: 4,
    defaultRoles: {
      worshipLeader: "",
      mainKeys: "",
      secondKeys: "",
      acousticGuitar: "",
      electricGuitar: "",
      bass: "",
      drums: "",
      extraBandMembers: [],
      backupSingers: ["", ""],
      media: "",
      dancers: ["", "", ""],
    },
  },
];

type ServiceTemplateRow = {
  id: string;
  name: string;
  service_type: string;
  location: string;
  call_time: string;
  rehearsal_time: string;
  reminder_frequency: ReminderRecurrence;
  reminder_occurrences: number;
  default_roles: unknown;
};

export function mapServiceTemplate(row: ServiceTemplateRow): ServiceTemplate {
  return {
    id: row.id,
    name: row.name,
    serviceType: row.service_type,
    location: row.location,
    callTime: row.call_time,
    rehearsalTime: row.rehearsal_time,
    reminderFrequency: row.reminder_frequency,
    reminderOccurrences: row.reminder_occurrences,
    defaultRoles: normalizeTemplateRoles(row.default_roles),
  };
}

function normalizeTemplateRoles(value: unknown): ServiceTemplateRoles {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const roles = value as Record<string, unknown>;

  return {
    worshipLeader: stringValue(roles.worshipLeader),
    acousticGuitar: stringValue(roles.acousticGuitar),
    electricGuitar: stringValue(roles.electricGuitar),
    bass: stringValue(roles.bass),
    drums: stringValue(roles.drums),
    mainKeys: stringValue(roles.mainKeys),
    secondKeys: stringValue(roles.secondKeys),
    extraBandMembers: stringArray(roles.extraBandMembers),
    backupSingers: stringArray(roles.backupSingers),
    media: stringValue(roles.media),
    dancers: stringArray(roles.dancers),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
