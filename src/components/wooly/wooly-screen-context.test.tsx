import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WoolyAudience } from "@/lib/domain/wooly";
import type { TeamContext } from "@/lib/supabase/team-context";

const environment = vi.hoisted(() => ({ desktop: false, configured: true }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => environment.desktop }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => environment.configured }));
vi.mock("./wooly-screen", () => ({
  WoolyScreen: ({ audience }: { audience: WoolyAudience }) => <output aria-label="Tutorial audience">{JSON.stringify(audience)}</output>,
}));

import { WoolyTeamScreen } from "./wooly-team-screen";
import { WoolyPublicScreen } from "./wooly-public-screen";

const context: TeamContext = {
  userId: "verified-profile", teamId: "verified-team", memberId: "verified-member",
  teamName: "Sunday team", teamCode: null, role: "member", canManageMembers: false,
  hasPendingJoinRequest: false,
};
const audience = (): WoolyAudience => JSON.parse(screen.getByLabelText("Tutorial audience").textContent!);

beforeEach(() => {
  environment.desktop = false;
  environment.configured = true;
  vi.stubEnv("WOOLY_TUTORIAL_ENABLED", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("Wooly verified screen context", () => {
  it("uses resolved role restrictions and explicit custom grants", () => {
    render(<WoolyTeamScreen context={{ ...context, role: "member", permissionOverrides: { "songs.edit": true }, customPermissions: [] }} />);
    expect(audience()).toEqual({
      userId: "verified-profile", teamId: "verified-team", hasTeam: true, canManageMembers: false,
      role: "member", session: "account", permissions: ["songs.create", "songs.edit", "attendance.confirm", "messages.send", "prayer_requests.create"],
    });
    expect(audience().permissions).not.toContain("members.manage");
  });

  it("keeps account identity separate from unauthenticated demo identity", () => {
    const view = render(<WoolyTeamScreen context={{ ...context, userId: null }} />);
    expect(audience().userId).toBe("");
    expect(audience().session).toBe("account");
    environment.configured = false;
    view.rerender(<WoolyTeamScreen context={{ ...context, userId: null }} />);
    expect(audience().userId).toBe("demo-user");
    expect(audience().session).toBe("demo");
  });

  it("keeps the team tutorial disabled before activation and in the desktop app", () => {
    vi.stubEnv("WOOLY_TUTORIAL_ENABLED", "0");
    const view = render(<WoolyTeamScreen context={context} />);
    expect(screen.queryByLabelText("Tutorial audience")).not.toBeInTheDocument();
    vi.stubEnv("WOOLY_TUTORIAL_ENABLED", "1");
    environment.desktop = true;
    view.rerender(<WoolyTeamScreen context={context} />);
    expect(screen.queryByLabelText("Tutorial audience")).not.toBeInTheDocument();
  });

  it("registers public pages as guests without team privileges", () => {
    render(<WoolyPublicScreen />);
    expect(audience()).toEqual({ userId: "wooly-public", hasTeam: false, canManageMembers: false, session: "guest" });
  });
});
