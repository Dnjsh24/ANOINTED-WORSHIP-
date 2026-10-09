import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPersonalSummary } from "@/components/dashboard-personal-summary";

describe("DashboardPersonalSummary", () => {
  it("shows the next service, personal response, and outstanding reminders", () => {
    render(
      <DashboardPersonalSummary
        nextEvent={{
          id: "event-1",
          name: "Sunday Service",
          date: "2026-10-11",
          time: "09:00 - 10:30",
          location: "Main Sanctuary",
        }}
        assignment="Keys"
        attendance="no_response"
        preparationItems={[
          { id: "reminder-1", title: "Review the setlist", body: "Practice before Saturday.", targetPath: "/reminders" },
        ]}
        outstandingCount={2}
      />,
    );

    expect(screen.getByRole("region", { name: "Your next service" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sunday Service" })).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByText("Your assignment:").parentElement).toHaveTextContent("Keys");
    expect(screen.getByText("RSVP:").parentElement).toHaveTextContent("Response needed");
    expect(screen.getByRole("link", { name: "Confirm availability" })).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByRole("link", { name: /Review the setlist/ })).toHaveAttribute("href", "/reminders");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("avoids implying an RSVP exists when personal event data is unavailable", () => {
    render(
      <DashboardPersonalSummary
        nextEvent={null}
        assignment={null}
        attendance={null}
        preparationItems={[]}
        outstandingCount={0}
      />,
    );

    expect(screen.getByText("No upcoming event is scheduled.")).toBeInTheDocument();
    expect(screen.getByText("No open service reminders are waiting.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Confirm availability" })).not.toBeInTheDocument();
  });
});
