import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import StageModeClient, { type StageSetlist } from "./stage-mode-client";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({ updateSetlistSongKeyAction: save }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => null }));
const setlist: StageSetlist = { id: "set", date: "2026-10-11", type: "practice", songs: ["C", "G"].map((key, index) => ({ id: `slot-${index}`, order: index + 1, assignedKey: key, lead: "", arrangement: null, youtubeUrl: null, song: { id: `song-${index}`, title: `Song ${index}`, bpm: 80, originalKey: key, lyricsChords: "Verse\nC\nLyrics" } })) };
beforeEach(() => { save.mockReset(); localStorage.clear(); });

it("restores the last successfully saved key when a subsequent save fails", async () => {
  save.mockResolvedValueOnce({ ok: true, message: "Saved" }).mockResolvedValueOnce({ ok: false, message: "Offline" });
  render(<StageModeClient setlist={setlist} canManageSetlist renderPracticeTools={() => null} />);
  await waitFor(() => expect(screen.getByText("C", { selector: "span.w-12" })).toBeVisible());
  await new Promise(resolve => setTimeout(resolve, 10));
  fireEvent.click(screen.getByRole("button", { name: "Raise setlist key" }));
  await screen.findByText("Key saved to setlist.");
  expect(screen.getByText("Db", { selector: "span.w-12" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Raise setlist key" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Db", { selector: "span.w-12" })).toBeVisible();
});

it("keeps a newly selected song's key when the previous song save fails", async () => {
  let resolveSave!: (result: { ok: boolean; message: string }) => void;
  save.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
  render(<StageModeClient setlist={setlist} canManageSetlist renderPracticeTools={() => null} />);
  await new Promise(resolve => setTimeout(resolve, 10));
  fireEvent.click(screen.getByRole("button", { name: "Raise setlist key" }));
  fireEvent.click(screen.getByRole("button", { name: "Next song" }));
  await waitFor(() => expect(screen.getByText("G", { selector: "span.w-12" })).toBeVisible());
  resolveSave({ ok: false, message: "Offline" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Raise setlist key" })).toBeEnabled());
  expect(screen.getByText("G", { selector: "span.w-12" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
