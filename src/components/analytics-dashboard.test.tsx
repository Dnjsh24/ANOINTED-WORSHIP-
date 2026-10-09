import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { parseAnalyticsRange, type AnalyticsData } from "@/lib/domain/analytics";

const range = parseAnalyticsRange(
  { start: "2026-10-01", end: "2026-10-07" },
  new Date("2026-10-08T02:00:00Z"),
);

function makeAnalytics(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    mode: "live",
    range,
    songs: {
      status: "ready",
      data: [
        { id: "song-1", title: "Goodness of God", count: 8, previousCount: 5 },
        { id: "song-2", title: "Way Maker", count: 4, previousCount: 3 },
        { id: "song-3", title: "Previous Song", count: 0, previousCount: 9 },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: "song-" + (index + 4),
          title: "More Song " + (index + 1),
          count: 3 - (index % 3),
          previousCount: 2,
        })),
      ],
    },
    availability: {
      status: "ready",
      data: {
        current: { available: 3, total: 4, rate: 75, eventCount: 2 },
        previous: { available: 2, total: 4, rate: 50, eventCount: 2 },
        byEventType: [
          { type: "service", label: "Service", available: 2, total: 3, rate: 66.7, eventCount: 1 },
          { type: "rehearsal", label: "Rehearsal", available: 1, total: 1, rate: 100, eventCount: 1 },
        ],
        daily: [
          { date: "2026-09-24", available: 1, total: 2, rate: 50, eventCount: 1 },
          { date: "2026-10-01", available: 2, total: 3, rate: 66.7, eventCount: 1 },
          { date: "2026-10-05", available: 1, total: 1, rate: 100, eventCount: 1 },
        ],
      },
    },
    messages: {
      status: "ready",
      data: [
        { id: "channel-team", name: "Worship Team", count: 42, previousCount: 36 },
        { id: "channel-announcements", name: "Announcements", count: 18, previousCount: 21 },
        { id: "channel-old", name: "Older Channel", count: 0, previousCount: 4 },
      ],
    },
    activity: {
      status: "ready",
      data: [
        {
          id: "activity-1",
          createdAt: "2026-10-07T02:14:00Z",
          category: "setlist",
          description: "Created setlist: Sunday Worship",
          actor: "Alex Rivera",
        },
        {
          id: "activity-2",
          createdAt: "2026-10-06T04:37:00Z",
          category: "song",
          description: "Added new song: Way Maker",
          actor: "Jordan Lee",
        },
      ],
    },
    totals: [
      { id: "songs", label: "Songs", href: "/songs", value: 18, message: null },
      { id: "setlists", label: "Setlists", href: "/setlists", value: 24, message: null },
      { id: "events", label: "Approved events", href: "/events", value: 31, message: null },
      { id: "members", label: "Active members", href: "/members", value: 12, message: null },
      { id: "channels", label: "Message channels", href: "/messages", value: 3, message: null },
      { id: "announcements", label: "Announcements", href: "/announcements", value: 9, message: null },
      { id: "dance", label: "Dance charts", href: "/dance", value: 4, message: null },
      { id: "requests", label: "Pending join requests", href: "/members/requests", value: 1, message: null },
    ],
    ...overrides,
  };
}

describe("AnalyticsDashboard", () => {
  it("charts the recorded response ratio and recent activity counts", () => {
    render(<AnalyticsDashboard analytics={makeAnalytics()} />);
    expect(screen.getByRole("img", { name: "Availability snapshot: 75% available, 3 of 4 recorded responses" })).toBeInTheDocument();
    const breakdown = screen.getByRole("list", { name: "Recent activity breakdown by area" });
    expect(within(breakdown).getAllByRole("listitem")).toHaveLength(2);
    expect(within(breakdown).getAllByText("50% of recent entries")).toHaveLength(2);
    expect(within(breakdown).getByText("setlist")).toBeInTheDocument();
    expect(within(breakdown).getByText("song")).toBeInTheDocument();
  });

  it("does not turn missing chart sources into zero activity", () => {
    render(<AnalyticsDashboard analytics={makeAnalytics({
      availability: { status: "unavailable", message: "Responses unavailable" },
      activity: { status: "unavailable", message: "Activity unavailable" },
    })} />);
    expect(screen.queryByRole("img", { name: /Availability snapshot:/ })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Activity breakdown" });
    expect(within(panel).getByRole("status")).toHaveTextContent("Activity unavailable");
    expect(within(panel).queryByText("0 entries")).not.toBeInTheDocument();
  });

  it("presents the selected date range, current rotation, weighted responses, charts, and website totals", () => {
    render(<AnalyticsDashboard analytics={makeAnalytics()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-07");
    expect(screen.getByRole("region", { name: "Analytics summary" })).toHaveTextContent("Confirmed availability");
    expect(screen.getByRole("region", { name: "Analytics summary" })).toHaveTextContent("3 of 4 recorded responses");
    expect(screen.getByRole("heading", { name: "Song Usage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Attendance Trend" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Availability trend line chart/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team Activity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Channel Activity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Availability by Event Type" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Website Totals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Songs.*18/ })).toHaveAttribute("href", "/songs");
    expect(screen.queryByText("Previous Song", { selector: "span" })).not.toBeInTheDocument();
  });

  it("updates the song limit, channel selection, activity area, and trend interval", () => {
    render(<AnalyticsDashboard analytics={makeAnalytics()} />);

    fireEvent.change(screen.getByLabelText("Songs shown"), { target: { value: "10" } });
    expect(screen.getByText("More Song 6", { selector: "span" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter message volume by channel"), { target: { value: "channel-team" } });
    const channelRows = within(screen.getByRole("list", { name: "Message volume by channel" }));
    expect(channelRows.getByText("Worship Team", { selector: "span" })).toBeInTheDocument();
    expect(channelRows.queryByText("Announcements", { selector: "span" })).not.toBeInTheDocument();
    expect(channelRows.getAllByRole("listitem")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Filter team activity by area"), { target: { value: "song" } });
    const activityTable = screen.getByRole("region", { name: "Recent team activity" });
    expect(within(activityTable).getByText("Added new song: Way Maker")).toBeInTheDocument();
    expect(within(activityTable).queryByText("Created setlist: Sunday Worship")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Trend interval"), { target: { value: "daily" } });
    fireEvent.click(screen.getByText("Attendance trend data"));
    expect(screen.getByRole("table", { name: /Confirmed availability by day/ })).toBeInTheDocument();
  });

  it("distinguishes an empty period from a failed source and keeps failed totals unavailable", () => {
    const analytics = makeAnalytics({
      songs: { status: "ready", data: [] },
      messages: { status: "unavailable", message: "Message volume could not be loaded. Try again." },
      availability: {
        status: "ready",
        data: {
          current: { available: 0, total: 0, rate: null, eventCount: 0 },
          previous: { available: 0, total: 0, rate: null, eventCount: 0 },
          byEventType: [],
          daily: [],
        },
      },
      totals: [{ id: "songs", label: "Songs", href: "/songs", value: null, message: "Songs could not be counted. Try again." }],
    });
    render(<AnalyticsDashboard analytics={analytics} />);

    expect(screen.getByText("No setlist appearances in this date range.")).toBeInTheDocument();
    expect(screen.getByText("No availability responses in either period.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Availability snapshot: no recorded responses" })).toBeInTheDocument();
    expect(screen.getAllByText("Message volume could not be loaded. Try again.")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Songs count unavailable/ })).toHaveTextContent("Unavailable");
  });

  it("identifies demo illustrations and bounds date controls to supported dates", () => {
    render(<AnalyticsDashboard analytics={makeAnalytics({
      mode: "demo",
      range: parseAnalyticsRange({}, new Date("2026-10-08T02:00:00Z")),
    })} />);

    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveAttribute("min", "1970-01-01");
    expect(screen.getByLabelText("From")).toHaveAttribute("max", range.today);
    expect(screen.queryByRole("navigation", { name: "Quick date ranges" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^(7|30|90) days$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
  });
});
