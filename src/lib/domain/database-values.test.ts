import { describe, expect, it } from "vitest";
import {
  asEventApprovalStatus,
  asNoticePriority,
  asReminderRecurrence,
} from "./database-values";

describe("database text constraint normalization", () => {
  it("preserves known constrained values", () => {
    expect(asEventApprovalStatus("pending")).toBe("pending");
    expect(asNoticePriority("urgent")).toBe("urgent");
    expect(asReminderRecurrence("monthly")).toBe("monthly");
  });

  it("uses the least surprising safe fallback for unknown values", () => {
    expect(asEventApprovalStatus("corrupt")).toBe("approved");
    expect(asNoticePriority("corrupt")).toBe("normal");
    expect(asReminderRecurrence("corrupt")).toBe("none");
  });
});
