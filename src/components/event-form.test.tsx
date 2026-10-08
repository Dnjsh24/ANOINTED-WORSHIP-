import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventForm } from "./event-form";
import { members } from "@/lib/sample-data";
vi.mock("@/app/actions", () => ({ createEventAction: vi.fn(), updateEventAction: vi.fn() }));
const initial = { id: "event", name: "Sunday", type: "service_rehearsal", date: "2026-10-11", startTime: "09:00", endTime: "11:00", rehearsalDate: "2026-10-10", rehearsalStartTime: "18:00", rehearsalEndTime: "19:00", location: "Hall", assignedTeams: [], notes: "", linkedSetlistId: "" };
const fetchMock = vi.fn();
const show = () => render(<EventForm initialEvent={initial} initialAssignments={{ worshipLeader: members[0].id }} teamMembers={members} />);
async function debounce() { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Event conflict feedback", () => {
  it("includes service and rehearsal windows and visibly reports unavailable checks with retry", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ conflicts: [] }) });
    show(); await debounce();
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({ date: initial.date, startTime: "09:00", endTime: "11:00", rehearsalDate: initial.rehearsalDate, rehearsalStartTime: "18:00", rehearsalEndTime: "19:00", memberIds: [members[0].id] });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be checked");
    fireEvent.click(screen.getByRole("button", { name: "Retry conflict check" })); await debounce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("aborts and ignores an older response after dates change", async () => {
    let resolveOld!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ conflicts: [{ memberName: "Current", eventName: "New date" }] }) });
    const view = show(); await debounce();
    const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    fireEvent.change(view.container.querySelector('input[name="date"]')!, { target: { value: "2026-10-12" } });
    expect(oldSignal.aborted).toBe(true); await debounce();
    expect(screen.getByText("New date")).toBeInTheDocument();
    await act(async () => { resolveOld({ ok: true, json: async () => ({ conflicts: [{ memberName: "Stale", eventName: "Old date" }] }) }); });
    expect(screen.queryByText("Old date")).toBeNull();
  });
  it("requires explicit acknowledgement and resets it when a schedule changes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ conflicts: [{ memberName: "Alex", eventName: "Other event" }] }) });
    const view = show(); await debounce();
    const checkbox = screen.getByRole("checkbox", { name: /I reviewed these conflicts/ });
    expect(checkbox).toBeRequired(); expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox); expect(checkbox).toBeChecked();
    fireEvent.change(view.container.querySelector('input[name="startTime"]')!, { target: { value: "10:00" } });
    expect(screen.getByRole("status")).toHaveTextContent("Checking"); await debounce();
    expect(screen.getByRole("checkbox", { name: /I reviewed these conflicts/ })).not.toBeChecked();
  });
});
