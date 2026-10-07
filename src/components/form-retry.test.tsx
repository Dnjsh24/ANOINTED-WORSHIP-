import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setlists, songs } from "@/lib/sample-data";
const actions = vi.hoisted(() => ({ event: vi.fn(), setlist: vi.fn() }));
vi.mock("@/app/actions", () => ({
  createEventAction: actions.event, updateEventAction: actions.event,
  createSetlistAction: actions.setlist, updateSetlistAction: actions.setlist,
}));
import { EventForm } from "./event-form";
import { SetlistForm } from "./setlist-form";
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockRejectedValueOnce(new Error("Disconnected"))
    .mockResolvedValue({ ok: false, message: "Changed on server. Keep your draft." });
});
it("keeps event notes, location and revision after a rejected action and permits retry", async () => {
  const { container } = render(<EventForm revision={9} initialEvent={{ id: "event", name: "Sunday", type: "service", date: "2026-10-11", startTime: "09:00", endTime: "11:00", rehearsalDate: "", rehearsalStartTime: "", rehearsalEndTime: "", location: "Hall", assignedTeams: [], notes: "", linkedSetlistId: "" }} />);
  const location = container.querySelector('input[name="location"]')!;
  const notes = container.querySelector('textarea[name="notes"]')!;
  fireEvent.change(location, { target: { value: "New hall" } });
  fireEvent.change(notes, { target: { value: "Keep this cue" } });
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText(/The save could not be confirmed/);
  expect(location).toHaveValue("New hall"); expect(notes).toHaveValue("Keep this cue");
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(actions.event).toHaveBeenCalledTimes(2));
  expect(actions.event.mock.calls[1][1].get("revision")).toBe("9");
  expect(actions.event.mock.calls[1][1].get("notes")).toBe("Keep this cue");
});
it("keeps setlist notes, selected songs and both revisions after a rejected action", async () => {
  const { container } = render(<SetlistForm setlist={setlists[0]} revision={7} eventRevision={12} songs={songs.map(song => ({ id: song.id, title: song.title, original_key: song.originalKey, bpm: song.bpm ?? null }))} />);
  const notes = container.querySelector('textarea[name="notes"]')!;
  fireEvent.change(notes, { target: { value: "Watch the ending" } });
  const before = new FormData(container.querySelector("form")!).getAll("songIds");
  expect(before.length).toBeGreaterThan(0);
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText(/The save could not be confirmed/);
  expect(notes).toHaveValue("Watch the ending");
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(actions.setlist).toHaveBeenCalledTimes(2));
  const retry: FormData = actions.setlist.mock.calls[1][1];
  expect(retry.getAll("songIds")).toEqual(before);
  expect(retry.get("notes")).toBe("Watch the ending");
  expect(retry.get("revision")).toBe("7"); expect(retry.get("eventRevision")).toBe("12");
});
