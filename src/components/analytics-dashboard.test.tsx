import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

describe("AnalyticsDashboard", () => {
  it("summarizes and labels the available engagement data", () => {
    render(
      <AnalyticsDashboard
        mostPlayedSongs={[
          { title: "Goodness of God", count: 8 },
          { title: "Way Maker", count: 4 },
        ]}
        attendanceStats={[
          { type: "sunday_service", rate: 92 },
          { type: "rehearsal", rate: 84 },
        ]}
        mostActiveChannels={[
          { name: "Worship Team", count: 42 },
          { name: "Announcements", count: 18 },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "Engagement summary" })).toBeInTheDocument();
    expect(screen.getByText("Goodness of God", { selector: "p[title]" })).toBeInTheDocument();
    expect(screen.getByLabelText("Average attendance 88%")).toBeInTheDocument();
    expect(screen.getByText("60", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Most active channels")).toBeInTheDocument();
  });

  it("shows useful empty states when a team has no analytics yet", () => {
    render(
      <AnalyticsDashboard
        mostPlayedSongs={[]}
        attendanceStats={[]}
        mostActiveChannels={[]}
      />,
    );

    expect(screen.getByText("Your rotation will appear here")).toBeInTheDocument();
    expect(screen.getByText("No attendance signal yet")).toBeInTheDocument();
    expect(screen.getByText("Quiet channels for now")).toBeInTheDocument();
  });
});
