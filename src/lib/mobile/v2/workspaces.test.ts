import { describe, expect, it } from "vitest";
import { mobileSelectedWorkspaceSchema, mobileWorkspacesRequestSchema, mobileWorkspacesResponseSchema } from "./workspaces";

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const membership = { teamId: id(2), memberId: id(3), teamName: "Worship", role: "member", permissions: ["messages.send"] };
const response = { version: 2, userId: id(1), memberships: [membership], nextId: null, pendingJoin: false };
describe("v2 workspace contracts", () => {
  it("accepts account-only pagination and explicit workspace selection", () => {
    expect(mobileWorkspacesRequestSchema.parse({ version: 2, after: id(2) })).toEqual({ version: 2, after: id(2) });
    expect(mobileSelectedWorkspaceSchema.parse({ version: 2, teamId: id(2) }).teamId).toBe(id(2));
    expect(mobileWorkspacesResponseSchema.safeParse(response).success).toBe(true);
  });
  it.each([{ version: 1 }, { version: 2, after: "bad" }, { version: 2, teamId: id(2) }])("rejects unscoped or malformed input %o", input => {
    expect(mobileWorkspacesRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    { ...response, userId: "bad" },
    { ...response, memberships: [membership, membership] },
    { ...response, memberships: [{ ...membership, permissions: ["server.admin"] }] },
    { ...response, memberships: [{ ...membership, permissions: ["messages.send", "messages.send"] }] },
    { ...response, memberships: [{ ...membership, code: "private-team-code" }] },
    { ...response, nextId: id(2) },
  ])("rejects unsafe response %o", input => {
    expect(mobileWorkspacesResponseSchema.safeParse(input).success).toBe(false);
  });
  it("binds nextId to the final ascending workspace of a full page", () => {
    const memberships = Array.from({ length: 50 }, (_, index) => ({ ...membership, teamId: id(index + 10) }));
    expect(mobileWorkspacesResponseSchema.safeParse({ ...response, memberships, nextId: id(59) }).success).toBe(true);
    expect(mobileWorkspacesResponseSchema.safeParse({ ...response, memberships, nextId: id(60) }).success).toBe(false);
    expect(mobileWorkspacesResponseSchema.safeParse({ ...response, memberships: [...memberships].reverse(), nextId: null }).success).toBe(false);
  });
});
