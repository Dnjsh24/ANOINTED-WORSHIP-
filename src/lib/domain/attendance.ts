import type { AttendanceStatus } from "@/lib/types";

export function attendanceLabel(status: AttendanceStatus) {
  switch (status) {
    case "available":
      return "I'm available";
    case "maybe":
      return "Maybe";
    case "unavailable":
      return "I can't attend";
    case "pending":
      return "Pending";
  }
}

export function attendanceSummary(statuses: AttendanceStatus[]) {
  return statuses.reduce(
    (summary, status) => ({
      ...summary,
      [status]: summary[status] + 1,
    }),
    {
      available: 0,
      maybe: 0,
      unavailable: 0,
      pending: 0,
    } satisfies Record<AttendanceStatus, number>,
  );
}
