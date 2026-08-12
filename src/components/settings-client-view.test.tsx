import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsClientView } from "@/components/settings-client-view";

vi.mock("@/app/actions", () => ({
  createCustomRoleAction: vi.fn(),
  deleteCustomRoleAction: vi.fn(),
  deleteTeamAction: vi.fn(),
  leaveTeamAction: vi.fn(),
  updateTeamRolePermissionsAction: vi.fn(),
}));

const baseProps = {
  teamId: "00000000-0000-4000-8000-000000000001",
  teamName: "Test Team",
  teamCode: "TT-10001",
  isAdmin: true,
  defaultServiceLocation: "Main Sanctuary",
  defaultCallTime: "08:00",
  defaultRehearsalTime: "08:15",
};

describe("SettingsClientView role permissions", () => {
  it("lets only the owner edit non-owner permissions and keeps owner access locked", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsClientView {...baseProps} role="owner" />);

    await user.click(screen.getByRole("button", { name: "Permissions" }));

    expect(screen.getByRole("checkbox", { name: "Owner: Manage Members" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Owner: Manage Members" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Admin: Manage Members" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save role permissions" })).toBeInTheDocument();

    unmount();
    render(<SettingsClientView {...baseProps} role="admin" />);
    await user.click(screen.getByRole("button", { name: "Permissions" }));

    expect(screen.getByRole("checkbox", { name: "Admin: Manage Members" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save role permissions" })).not.toBeInTheDocument();
  });
});
