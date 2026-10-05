import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberUsageAnalytics } from "@/components/member-usage-analytics";

const loadDays = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => ({}) }));
vi.mock("@/lib/supabase/member-usage", () => ({ loadMemberUsageDays: loadDays }));

describe("member app usage analytics", () => {
  beforeEach(() => { loadDays.mockReset(); });
  it("ranks hours, shows frequency, and exposes dates with daily minutes", async () => {
    loadDays.mockResolvedValue({ kind: "ready", rows: [
      { member_id: "a", team_id: "team", usage_date: "2026-10-05", active_minutes: 30, sessions: 3 },
      { member_id: "b", team_id: "team", usage_date: "2026-10-04", active_minutes: 120, sessions: 2 },
    ] });
    render(<MemberUsageAnalytics teamId="team" memberNames={{ a: "Anna", b: "Ben" }} />);
    const table = await screen.findByRole("table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Ben");
    expect(rows[0]).toHaveTextContent("2.00");
    expect(rows[1]).toHaveTextContent("Anna");
    expect(screen.getByText("2026-10-05: 30 min, 3 sessions")).toBeInTheDocument();
    expect(screen.getByText(/Hidden and idle time is excluded/)).toBeInTheDocument();
    expect(screen.getByText(/Past usage cannot be recovered/)).toBeInTheDocument();
  });
  it("applies valid UTC dates and rejects reversed dates without a query", async () => {
    loadDays.mockResolvedValue({ kind: "ready", rows: [] });
    render(<MemberUsageAnalytics teamId="team" memberNames={{}} />);
    await screen.findByText("No recorded app usage in this date range.");
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Through (UTC)"), { target: { value: "2026-10-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Load usage" }));
    await waitFor(() => expect(loadDays).toHaveBeenLastCalledWith({}, "team", "2026-10-01", "2026-10-05"));
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-10-06" } });
    fireEvent.click(screen.getByRole("button", { name: "Load usage" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose valid UTC dates in order");
    expect(loadDays).toHaveBeenCalledTimes(2);
  });
  it("distinguishes missing deployment and errors from empty usage", async () => {
    loadDays.mockResolvedValue({ kind: "unavailable", message: "Usage tracking is unavailable until the member usage migration is deployed." });
    render(<MemberUsageAnalytics teamId="team" memberNames={{}} />);
    expect(await screen.findByText(/until the member usage migration is deployed/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No recorded app usage in this date range.")).not.toBeInTheDocument();
    loadDays.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Load usage" }));
    expect(await screen.findByText("Usage data could not load. Please retry.")).toBeInTheDocument();
  });
  it("does not invent demo statistics", async () => {
    render(<MemberUsageAnalytics teamId={null} memberNames={{}} />);
    expect(await screen.findByText(/Demo usage is not recorded/)).toBeInTheDocument();
    expect(loadDays).not.toHaveBeenCalled();
  });
});
