import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetlistsClient } from "@/components/setlists-client";
import type { SetlistWithEvent } from "@/lib/domain/setlist-events";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const standalone: SetlistWithEvent = {
  id: "standalone",
  name: "Song Ideas",
  date: "2026-08-13",
  leader: "Legacy Leader",
  location: "Legacy Sanctuary",
  callTime: "09:00",
  rehearsalTime: "08:00",
  serviceTimes: ["Sunday Worship"],
  linkedEvent: null,
  songs: [],
};

describe("SetlistsClient standalone presentation", () => {
  it("shows a standalone tab and hides event-only metadata from standalone cards", () => {
    render(<SetlistsClient setlists={[standalone]} referenceDate="2026-08-13" />);

    expect(screen.getByRole("tab", { name: "Standalone" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Standalone Setlists" })).toBeInTheDocument();
    expect(screen.getByText("Song Ideas")).toBeInTheDocument();
    expect(screen.getByText("Standalone", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Legacy Sanctuary")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy Leader")).not.toBeInTheDocument();
    expect(screen.queryByText("AUG")).not.toBeInTheDocument();
  });

  it("hides event-specific filters on the Standalone tab", () => {
    render(<SetlistsClient setlists={[standalone]} referenceDate="2026-08-13" />);
    fireEvent.click(screen.getByRole("tab", { name: "Standalone" }));

    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.queryByText("All leaders")).not.toBeInTheDocument();
    expect(screen.queryByText("All setlist types")).not.toBeInTheDocument();
  });

  it("uses the Timeline event approval status on linked cards", () => {
    render(
      <SetlistsClient
        referenceDate="2026-08-13"
        setlists={[{
          ...standalone,
          id: "linked",
          name: "Pending Event Songs",
          linkedEvent: {
            id: "event-1",
            name: "Pending Service",
            type: "service",
            serviceType: "Sunday Worship",
            date: "2026-08-16",
            startTime: "10:00",
            endTime: null,
            callTime: "09:00",
            rehearsalDate: null,
            rehearsalStart: null,
            rehearsalEnd: null,
            location: "Main Sanctuary",
            worshipLeader: "Alex Morgan",
            assignments: [],
            notes: null,
            approvalStatus: "pending",
          },
        }]}
      />,
    );

    expect(screen.getByText("Pending", { selector: "span" })).toBeInTheDocument();
  });
});
