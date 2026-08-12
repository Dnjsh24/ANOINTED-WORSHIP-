import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionsSource = readFileSync("src/app/actions.ts", "utf8");
const membersSource = readFileSync("src/components/members-client.tsx", "utf8");

describe("website mutation integrity boundaries", () => {
  it.each([
    "delete_setlist_cascade",
    "add_setlist_songs",
    "reorder_setlist_songs",
    "mark_channel_messages_read",
    "review_join_request",
    "leave_team_workspace",
    "delete_song_cascade",
    "delete_event_cascade",
  ])("uses the transactional %s RPC", (rpcName) => {
    expect(actionsSource).toContain(`.rpc("${rpcName}"`);
  });

  it("does not persist demo team codes in the production join action", () => {
    const joinAction = actionsSource.slice(
      actionsSource.indexOf("export async function joinTeamAction"),
      actionsSource.indexOf("export async function getPendingJoinRequestStatusAction"),
    );

    expect(joinAction).not.toContain("DM-10001");
    expect(joinAction).not.toContain("Mock team auto-join failed");
    expect(joinAction).not.toContain("const newTeamId = randomUUID()");
  });

  it("guards generic role updates and removals against owner mutation", () => {
    expect(actionsSource).toContain("canMutateTeamMember({");
    expect(actionsSource).toContain("transfer_team_ownership");
  });

  it("exposes ownership transfer separately from ordinary member role changes", () => {
    expect(membersSource).toContain("transferTeamOwnershipAction");
    expect(membersSource).toContain('currentUserRole === "owner"');
    expect(membersSource).toContain('member.role === "owner"');
    expect(membersSource).toContain("Transfer ownership");
  });

  it("validates slide settings and verifies the selected team before updating", () => {
    expect(actionsSource).toContain("slideSettingsSchema.safeParse");
    expect(actionsSource).toContain("relatedTeamId(slot) !== context.teamId");
  });

  it("restricts built-in role permission updates to the team owner", () => {
    const rolePermissionAction = actionsSource.slice(
      actionsSource.indexOf("export async function updateTeamRolePermissionsAction"),
      actionsSource.indexOf("export async function createCustomRoleAction"),
    );

    expect(rolePermissionAction).toContain('teamContext.role !== "owner"');
    expect(rolePermissionAction).toContain("teamRolePermissionsSchema.safeParse");
    expect(rolePermissionAction).toContain('.from("team_role_permissions")');
    expect(rolePermissionAction).toContain(".upsert(");
  });
});
