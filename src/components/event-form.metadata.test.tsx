import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventForm } from "@/components/event-form";

vi.mock("@/app/actions", () => ({
  createEventAction: vi.fn(),
  updateEventAction: vi.fn(),
  checkEventConflictsAction: vi.fn(async () => ({ ok: true, conflicts: [] })),
}));

describe("EventForm event-owned metadata", () => {
  it("captures a specific service type and a separate call time", () => {
    render(<EventForm teamMembers={[]} setlists={[]} serviceTemplates={[]} />);

    expect(screen.getByLabelText(/Service type/i)).toBeRequired();
    expect(screen.getByLabelText(/Call time/i)).toBeRequired();
    expect(screen.getByLabelText(/Start time/i)).toBeRequired();
  });
});
