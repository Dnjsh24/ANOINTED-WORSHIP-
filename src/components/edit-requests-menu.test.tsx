import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditRequestsMenu } from "./edit-requests-menu";
import { AppShellActions } from "./app-shell-actions";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), removeChannel: vi.fn(), eq: vi.fn(), limit: vi.fn(),
  response: { data: [] as { id: string; target_type: string; reason: string; requested_at: string }[], count: 0, error: null as null | { message: string } },
  realtime: undefined as undefined | (() => void),
}));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => ({
  from: mocks.from, removeChannel: mocks.removeChannel,
  channel: () => {
    const channel = { on: vi.fn((event: string, _filter: unknown, callback: () => void) => {
      if (event === "postgres_changes") mocks.realtime = callback;
      return channel;
    }), subscribe: vi.fn(() => channel), presenceState: () => ({}), track: vi.fn() };
    return channel;
  },
}) }));

const row = { id: "00000000-0000-4000-8000-000000000001", target_type: "song", reason: "Correct the song title", requested_at: "2026-10-14T01:00:00Z" };
function Harness({ teamId = "team-a", userId = "actor-a" }: { teamId?: string; userId?: string }) {
  const [open, setOpen] = useState(false);
  return <><EditRequestsMenu key={`${teamId}-${userId}`} teamId={teamId} userId={userId} open={open} onOpenChange={setOpen} /><button>Outside</button></>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.response = { data: [row], count: 12, error: null };
  mocks.realtime = undefined;
  mocks.from.mockImplementation(() => {
    const query = {
      select: vi.fn(() => query), eq: mocks.eq.mockImplementation(() => query),
      order: vi.fn(() => query), is: vi.fn(() => query),
      limit: mocks.limit.mockImplementation(() => Promise.resolve(mocks.response)),
      lte: vi.fn(() => Promise.resolve({ count: 0 })),
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("edit requests popup", () => {
  it("opens a preview without navigating and shows the exact accessible count with a capped badge", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("9+")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Edit requests" })).toHaveAccessibleDescription("12 pending edit requests");
    await user.click(screen.getByRole("button", { name: "Edit requests" }));
    expect(screen.getByRole("dialog", { name: "Edit requests" })).toBeInTheDocument();
    expect(screen.getByText(row.reason)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all requests/ })).toHaveAttribute("href", "/requests");
    expect(mocks.eq).toHaveBeenCalledWith("team_id", "team-a");
    expect(mocks.eq).toHaveBeenCalledWith("status", "pending");
    expect(mocks.limit).toHaveBeenCalledWith(5);
    await user.click(screen.getByRole("link", { name: /Song changes/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an empty state and removes the badge when pending requests are resolved", async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("9+")).toBeInTheDocument());
    mocks.response = { data: [], count: 0, error: null };
    act(() => mocks.realtime?.());
    await waitFor(() => expect(screen.queryByText("9+")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Edit requests" }));
    expect(await screen.findByText("No pending edit requests.")).toBeInTheDocument();
  });

  it("refreshes on opening and periodically even without realtime publication", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    await act(async () => {});
    const initial = mocks.limit.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Edit requests" }));
    await act(async () => {});
    expect(mocks.limit).toHaveBeenCalledTimes(initial + 1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(mocks.limit).toHaveBeenCalledTimes(initial + 2);
    fireEvent(window, new Event("focus"));
    await act(async () => {});
    expect(mocks.limit).toHaveBeenCalledTimes(initial + 3);
  });

  it("shows a load failure instead of an empty state and supports retry", async () => {
    mocks.response = { data: [], count: 0, error: { message: "offline" } };
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit requests" }));
    expect(await screen.findByText("Requests could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No pending edit requests.")).not.toBeInTheDocument();
    mocks.response = { data: [row], count: 1, error: null };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(row.reason)).toBeInTheDocument();
  });

  it("supports Escape, outside clicks and focus leaving the popup", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Edit requests" });
    await user.click(trigger);
    expect(screen.getByRole("link", { name: /Song changes/i })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the previous team's previews and ignores its late query when context changes", async () => {
    const view = render(<Harness />);
    await waitFor(() => expect(screen.getByText("9+")).toBeInTheDocument());
    let resolveOld: (value: typeof mocks.response) => void = () => {};
    mocks.limit.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    act(() => mocks.realtime?.());
    mocks.response = { data: [], count: 0, error: null };
    view.rerender(<Harness teamId="team-b" />);
    await act(async () => { resolveOld({ data: [row], count: 12, error: null }); });
    expect(screen.queryByText("9+")).not.toBeInTheDocument();
    expect(mocks.eq).toHaveBeenCalledWith("team_id", "team-b");
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it("keeps request and notification popups mutually exclusive", async () => {
    const user = userEvent.setup();
    render(<AppShellActions userId="actor-a" teamId="team-a" />);
    await user.click(screen.getByRole("button", { name: "Edit requests" }));
    expect(screen.getByRole("dialog", { name: "Edit requests" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Notifications" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit requests" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("preserves keyboard focus when the header rerenders", async () => {
    const user = userEvent.setup();
    const view = render(<AppShellActions userId="actor-a" teamId="team-a" />);
    await waitFor(() => expect(screen.getByText("9+")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit requests" }));
    const footer = screen.getByRole("link", { name: /View all requests/ });
    act(() => footer.focus());
    view.rerender(<AppShellActions userId="actor-a" teamId="team-a" desktopSync={<span>Synced</span>} />);
    expect(footer).toHaveFocus();
  });
});
