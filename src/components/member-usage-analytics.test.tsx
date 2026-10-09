import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const table = await screen.findByRole("table", { name: /Usage ranked by approximate active hours/ });
    const rows = table.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Ben");
    expect(rows[0]).toHaveTextContent("2.00");
    expect(rows[1]).toHaveTextContent("Anna");
    expect(screen.getByText("2026-10-05: 30 min, 3 sessions")).toBeInTheDocument();
    expect(screen.getByText(/Hidden and idle time is excluded/)).toBeInTheDocument();
    expect(screen.getByText(/Past usage cannot be recovered/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Daily active hours/ })).toBeInTheDocument();
    expect(screen.getByText("Active hours by member")).toBeInTheDocument();
  });
  it("applies valid UTC dates and rejects reversed dates without a query", async () => {
    loadDays.mockResolvedValue({ kind: "ready", rows: [] });
    render(<MemberUsageAnalytics teamId="team" memberNames={{}} />);
    await screen.findByText("No recorded app usage in this date range.");
    expect(screen.getByRole("img", { name: /Daily active hours/ })).toBeInTheDocument();
    const originalEnd = (screen.getByLabelText("Through (UTC)") as HTMLInputElement).value;
    const selectedStart = new Date(Date.parse(originalEnd) - 2 * 86_400_000).toISOString().slice(0, 10);
    const selectedEnd = new Date(Date.parse(originalEnd) - 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: selectedStart } });
    fireEvent.change(screen.getByLabelText("Through (UTC)"), { target: { value: selectedEnd } });
    await waitFor(() => expect(loadDays).toHaveBeenLastCalledWith({}, "team", selectedStart, selectedEnd));
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: originalEnd } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose valid UTC dates in order");
    expect(loadDays).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "Load usage" })).not.toBeInTheDocument();
  });

  it("does not query empty or overlong ranges, and resumes when dates become valid", async () => {
    loadDays.mockResolvedValue({ kind: "ready", rows: [] });
    render(<MemberUsageAnalytics teamId="team" memberNames={{}} />);
    await screen.findByText("No recorded app usage in this date range.");
    const end = (screen.getByLabelText("Through (UTC)") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Showing the last valid range");
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2000-01-01" } });
    expect(loadDays).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: end } });
    await waitFor(() => expect(loadDays).toHaveBeenLastCalledWith({}, "team", end, end));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an older response after changing dates", async () => {
    let resolveOld: ((value: { kind: "ready"; rows: [] }) => void) | undefined;
    loadDays.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    loadDays.mockResolvedValue({ kind: "ready", rows: [
      { member_id: "latest", team_id: "team", usage_date: "2026-10-05", active_minutes: 60, sessions: 1 },
    ] });
    render(<MemberUsageAnalytics teamId="team" memberNames={{ latest: "Latest member" }} />);
    const end = (screen.getByLabelText("Through (UTC)") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: end } });
    await screen.findByRole("table", { name: /Usage ranked/ });
    await act(async () => { resolveOld?.({ kind: "ready", rows: [] }); });
    await waitFor(() => expect(screen.getByRole("table", { name: /Usage ranked/ })).toHaveTextContent("Latest member"));
    expect(screen.queryByText("No recorded app usage in this date range.")).not.toBeInTheDocument();
  });
  it("distinguishes missing deployment and errors from empty usage", async () => {
    loadDays.mockResolvedValue({ kind: "unavailable", message: "Usage tracking is unavailable until the member usage migration is deployed." });
    render(<MemberUsageAnalytics teamId="team" memberNames={{}} />);
    expect(await screen.findByText(/until the member usage migration is deployed/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("No recorded app usage in this date range.")).not.toBeInTheDocument();
    loadDays.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Usage data could not load. Please retry.")).toBeInTheDocument();
    loadDays.mockResolvedValue({ kind: "ready", rows: [] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No recorded app usage in this date range.")).toBeInTheDocument();
  });
  it("does not invent demo statistics", async () => {
    render(<MemberUsageAnalytics teamId={null} memberNames={{}} />);
    expect(await screen.findByText(/Demo usage is not recorded/)).toBeInTheDocument();
    expect(loadDays).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
