import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetlistFormEvent } from "@/components/setlist-form";

const mocks = vi.hoisted(() => ({ client: vi.fn(), form: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/team-guard", () => ({
  getRequiredTeamContext: async () => ({ teamId: "team-1", userId: "user-1", role: "owner" }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/setlist-template-picker", () => ({ SetlistTemplatePicker: () => null }));
vi.mock("@/components/setlist-form", () => ({ SetlistForm: (props: unknown) => { mocks.form(props); return null; } }));
import NewSetlistPage from "./page";

const availableEvent: SetlistFormEvent = {
  id: "event-1", name: "Band rehearsal", type: "rehearsal", event_date: "2026-10-18",
};

function mockEvents(error: unknown = null) {
  const filters: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const result = table === "events"
      ? { data: [{ ...availableEvent, setlists: [] }, { ...availableEvent, id: "occupied", setlists: [{ id: "setlist-1" }] }], error }
      : { data: [], error: null };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query; },
      is: (key: string, value: unknown) => { filters.push([table, key, value]); return query; },
      order: () => query,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
  mocks.client.mockResolvedValue({ from });
  return filters;
}

beforeEach(() => vi.clearAllMocks());

describe("new setlist Timeline options", () => {
  it("loads approved active-team events with no active setlist and preselects a valid Timeline link", async () => {
    const filters = mockEvents();
    renderToStaticMarkup(await NewSetlistPage({ searchParams: Promise.resolve({ eventId: "event-1" }) }));
    expect(filters).toContainEqual(["events", "team_id", "team-1"]);
    expect(filters).toContainEqual(["events", "approval_status", "approved"]);
    expect(filters).toContainEqual(["events", "deleted_at", null]);
    expect(filters).toContainEqual(["events", "setlists.deleted_at", null]);
    expect(mocks.form).toHaveBeenCalledWith(expect.objectContaining({ events: [availableEvent], eventId: "event-1", initialEventType: "rehearsal" }));
  });

  it.each(["foreign-event", "occupied"])("does not preselect unavailable event %s", async eventId => {
    mockEvents();
    renderToStaticMarkup(await NewSetlistPage({ searchParams: Promise.resolve({ eventId }) }));
    expect(mocks.form).toHaveBeenCalledWith(expect.objectContaining({ eventId: undefined }));
  });

  it("reports event-query failures without exposing stale options", async () => {
    mockEvents({ message: "unavailable" });
    renderToStaticMarkup(await NewSetlistPage({ searchParams: Promise.resolve({ eventId: "event-1" }) }));
    expect(mocks.form).toHaveBeenCalledWith(expect.objectContaining({ events: [], eventsUnavailable: true, eventId: undefined }));
  });
});
