import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersClient } from "@/components/members-client";
import type { JoinRequestSummary, TeamMember } from "@/lib/types";

const actionMocks = vi.hoisted(() => ({
  reviewJoinRequestWithStateAction: vi.fn(),
}));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/lib/supabase/client", () => ({
  createOptionalClient: () => null,
}));

vi.mock("@/app/actions", () => ({
  bulkApproveJoinRequestsAction: vi.fn(),
  regenerateTeamCodeAction: vi.fn(),
  removeTeamMemberAction: vi.fn(),
  reviewJoinRequestAction: vi.fn(),
  reviewJoinRequestWithStateAction: actionMocks.reviewJoinRequestWithStateAction,
  transferTeamOwnershipAction: vi.fn(),
  updateMemberRoleAction: vi.fn(),
}));

const members: TeamMember[] = [
  {
    id: "member-alex",
    profile: { id: "profile-alex", fullName: "Alex Morgan", email: "alex@example.com" },
    role: "worship_leader",
    status: "active",
    attendanceRate: 98,
    ministry: "Worship Leader",
    ministries: ["Worship Leader"],
  },
  {
    id: "member-jordan",
    profile: { id: "profile-jordan", fullName: "Jordan Reed", email: "jordan@example.com" },
    role: "band_member",
    status: "active",
    attendanceRate: 92,
    ministry: "Band",
    ministries: ["Band"],
  },
  {
    id: "member-dan",
    profile: { id: "profile-dan", fullName: "Dan Fiscal", email: "dan@example.com" },
    role: "band_leader",
    status: "active",
    attendanceRate: 95,
    ministry: "Band Leader",
    ministries: ["Band Member", "Band Leader", "Electric Guitar"],
  },
];

const pendingRequest: JoinRequestSummary = {
  id: "00000000-0000-4000-8000-000000000123",
  initials: "RA",
  name: "Riley Applicant",
  email: "riley@example.com",
  ministry: "Band Member",
  requestedRole: "band_member",
};

function renderMembersClient() {
  return render(
    <MembersClient
      members={members}
      pendingRequests={[pendingRequest]}
      teamCode="TT-10001"
      teamId="00000000-0000-4000-8000-000000000001"
      currentUserRole="owner"
    />,
  );
}

describe("MembersClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a rejected request from the pending panel after a successful review", async () => {
    actionMocks.reviewJoinRequestWithStateAction.mockResolvedValue({
      ok: true,
      message: "Join request rejected.",
    });
    const user = userEvent.setup();
    renderMembersClient();

    await user.click(screen.getByRole("button", { name: "Reject Riley Applicant" }));

    await waitFor(() => expect(screen.queryByText("Riley Applicant")).not.toBeInTheDocument());
    expect(screen.getByText("Join request rejected.")).toBeVisible();
    const submittedFormData = actionMocks.reviewJoinRequestWithStateAction.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData.get("requestId")).toBe(pendingRequest.id);
    expect(submittedFormData.get("decision")).toBe("rejected");
  });

  it("makes View all team members reset filters and focus the complete member list", async () => {
    const user = userEvent.setup();
    renderMembersClient();

    await user.type(screen.getByPlaceholderText("Search members..."), "Nobody");
    await user.selectOptions(screen.getByLabelText("Role filter"), "band_member");
    expect(screen.queryByRole("button", { name: "View Alex Morgan" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View all team members" }));

    expect(screen.getByPlaceholderText("Search members...")).toHaveValue("");
    expect(screen.getByLabelText("Role filter")).toHaveValue("all");
    expect(screen.getByRole("button", { name: "View Alex Morgan" })).toBeVisible();
    expect(screen.getByTestId("active-team-panel")).toHaveFocus();
  });

  it("hides the generic Band Member badge when the member is a Band Leader", () => {
    renderMembersClient();

    const bandLeaderCard = within(screen.getByRole("button", { name: "View Dan Fiscal" }));
    expect(bandLeaderCard.getByText("Band Leader")).toBeVisible();
    expect(bandLeaderCard.getByText("Electric Guitar")).toBeVisible();
    expect(bandLeaderCard.queryByText("Band Member")).not.toBeInTheDocument();
  });
});
