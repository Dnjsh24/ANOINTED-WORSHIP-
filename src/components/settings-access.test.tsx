import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPermissionEditor } from "./team-permission-editor";
import { SettingsClientView } from "./settings-client-view";
import { RegenerateTeamCodeButton } from "./team-code-actions";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn(), regenerate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions", () => ({
  setTeamPermissionOverrideAction: mocks.save, regenerateTeamCodeAction: mocks.regenerate,
  deleteTeamAction: vi.fn(), leaveTeamAction: vi.fn(), createCustomRoleAction: vi.fn(), deleteCustomRoleAction: vi.fn(), updateTeamSettingsAction: vi.fn(),
}));
const teamId = "00000000-0000-0000-0000-000000000001";
const memberId = "00000000-0000-0000-0000-000000000002";
const member = { id: memberId, name: "Live member", role: "member", customPermissions: [] };
const base = { teamId, teamName: "Current team", teamCode: "CT-12345", isAdmin: true, role: "owner", defaultServiceLocation: "Location", defaultCallTime: "09:00", defaultRehearsalTime: "08:30" };

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ ok: true, message: "Permission saved." }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("settings permissions", () => {
  it("saves selected role and person decisions using the correct target", async () => {
    render(<TeamPermissionEditor teamId={teamId} members={[member]} overrides={[]} available isOwner />);
    const setting = screen.getByLabelText(/Manage Team Settings/);
    fireEvent.change(setting, { target: { value: "deny" } });
    const form = setting.closest("form");
    if (!form) throw new Error("Permission row form missing");
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const roleData = mocks.save.mock.calls[0][1];
    expect(roleData).toBeInstanceOf(FormData);
    expect(roleData.get("role")).toBe("admin");
    expect(roleData.get("targetKind")).toBe("role");
    expect(roleData.get("permission")).toBe("team.manage");
    expect(roleData.get("value")).toBe("deny");
    fireEvent.change(screen.getByRole("combobox", { name: /Edit permissions for/ }), { target: { value: "person" } });
    const personSetting = screen.getByLabelText(/Edit Songs/);
    fireEvent.change(personSetting, { target: { value: "allow" } });
    const personForm = personSetting.closest("form");
    if (!personForm) throw new Error("Person permission row missing");
    fireEvent.click(within(personForm).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].get("memberId")).toBe(memberId);
    expect(mocks.save.mock.calls[1][1].get("targetKind")).toBe("person");
    expect(mocks.save.mock.calls[1][1].get("value")).toBe("allow");
  });
  it("shows effective person precedence and makes admin access read-only", () => {
    render(<TeamPermissionEditor teamId={teamId} members={[member]} overrides={[{ role: "member", member_id: null, permission: "songs.edit", allowed: false }, { role: null, member_id: memberId, permission: "songs.edit", allowed: true }]} available isOwner={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Edit permissions for/ }), { target: { value: "person" } });
    expect(screen.getByLabelText(/Edit Songs.*Allowed/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("option", { name: "owner" })).toBeNull();
  });
});

describe("live settings activity", () => {
  it("renders supplied history, polls only while visible, and clears its timer", () => {
    vi.useFakeTimers();
    const view = render(<SettingsClientView {...base} activityLog={[{ id: "real-log", user: "Live actor", action: "regenerated invitation code", time: "2026-10-08T01:00:00Z", role: "owner" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Activity Log" }));
    expect(screen.getByText("Live actor")).toBeInTheDocument();
    expect(screen.queryByText("Casey Lee")).toBeNull();
    act(() => { vi.advanceTimersByTime(15000); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Team Controls" }));
    act(() => { vi.advanceTimersByTime(30000); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    view.unmount();
  });
  it("shows an empty state when no real activity exists", () => {
    render(<SettingsClientView {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Activity Log" }));
    expect(screen.getByText("No team activity recorded yet.")).toBeInTheDocument();
  });
});

describe("team code regeneration", () => {
  it("refreshes the current code after success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.regenerate.mockResolvedValue({ ok: true, message: "Team code regenerated." });
    render(<RegenerateTeamCodeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Generate new code" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Team code regenerated.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("shows failed regeneration and retains the existing code", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.regenerate.mockResolvedValue({ ok: false, message: "Team code could not be regenerated." });
    render(<RegenerateTeamCodeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Generate new code" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Team code could not be regenerated.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
