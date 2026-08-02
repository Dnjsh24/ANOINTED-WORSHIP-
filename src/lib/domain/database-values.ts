import type {
  EventApprovalStatus,
  NoticePriority,
  ReminderRecurrence,
} from "@/lib/types";

export function asEventApprovalStatus(value: string | null | undefined): EventApprovalStatus {
  return value === "pending" || value === "rejected" ? value : "approved";
}

export function asNoticePriority(value: string | null | undefined): NoticePriority {
  return value === "important" || value === "urgent" ? value : "normal";
}

export function asReminderRecurrence(value: string | null | undefined): ReminderRecurrence {
  return value === "weekly" || value === "monthly" ? value : "none";
}
