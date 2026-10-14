import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: { userId: "profile-a", teamId: "team-a" }, maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.maybeSingle };
  return { from: () => query };
} }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
vi.mock("@/lib/desktop/workspace", () => ({ getDesktopSetlist: vi.fn(), getDesktopPresenterLiveState: vi.fn() }));
vi.mock("@/components/wooly/wooly-team-screen", () => ({ WoolyTeamScreen: ({ context }: { context: typeof mocks.context }) => <output aria-label="Verified tutorial account">{context.userId}</output> }));
vi.mock("./projector-client", () => ({ default: () => <div>Projector output</div> }));
import ProjectorPage from "./page";

afterEach(() => vi.unstubAllEnvs());
it("registers the verified tutorial audience when an authenticated projector record loads", async () => {
  vi.stubEnv("WOOLY_TUTORIAL_ENABLED", "1");
  mocks.maybeSingle.mockResolvedValue({ data: { id: "plan-a", name: "Service", presentation_settings: null } });
  render(await ProjectorPage({ params: Promise.resolve({ id: "plan-a" }) }));
  expect(screen.getByLabelText("Verified tutorial account")).toHaveTextContent("profile-a");
  expect(screen.getByText("Projector output")).toBeInTheDocument();
});
