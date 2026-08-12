import { afterEach, describe, expect, it } from "vitest";
import {
  demoTeamContext,
  getCurrentTeamContext,
  getCurrentTeamContextForClient,
  getPostLoginRedirectPath,
} from "@/lib/supabase/team-context";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type QueryResult = { data: unknown; error?: unknown };

class FakeQueryBuilder {
  operations: Array<{ name: string; args: unknown[] }> = [];

  constructor(
    readonly table: string,
    private readonly result: QueryResult,
  ) {}

  select(...args: unknown[]) {
    this.operations.push({ name: "select", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.operations.push({ name: "eq", args });
    return this;
  }

  order(...args: unknown[]) {
    this.operations.push({ name: "order", args });
    return this;
  }

  limit(...args: unknown[]) {
    this.operations.push({ name: "limit", args });
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result);
  }

  single() {
    return Promise.resolve(this.result);
  }
}

function fakeSupabase({
  membershipResult,
  pendingRequestResult,
  customRoleResult = { data: null },
  rolePermissionsResult = { data: null },
  userResult = {
    data: { user: { id: "profile-1" } },
    error: null,
  },
}: {
  membershipResult: QueryResult;
  pendingRequestResult: QueryResult;
  customRoleResult?: QueryResult;
  rolePermissionsResult?: QueryResult;
  userResult?: {
    data: { user: { id: string } | null };
    error: unknown;
  };
}) {
  const builders: FakeQueryBuilder[] = [];
  const client = {
    auth: {
      getUser: async () => userResult,
    },
    from: (table: string) => {
      const builder = new FakeQueryBuilder(
        table,
        table === "team_members"
          ? membershipResult
          : table === "join_requests"
            ? pendingRequestResult
            : table === "custom_roles"
              ? customRoleResult
              : rolePermissionsResult,
      );
      builders.push(builder);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, builders };
}

describe("getCurrentTeamContextForClient", () => {
  afterEach(() => {
    delete process.env.E2E_FORCE_DEMO;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.ANW_DESKTOP_MODE;
  });

  it("uses the stable demo context when Supabase is unavailable", async () => {
    process.env.E2E_FORCE_DEMO = "1";
    await expect(getCurrentTeamContext()).resolves.toEqual(demoTeamContext);
  });

  it("returns the unauthenticated context when user verification fails", async () => {
    const { client, builders } = fakeSupabase({
      membershipResult: { data: null },
      pendingRequestResult: { data: null },
      userResult: {
        data: { user: null },
        error: new Error("invalid session"),
      },
    });

    await expect(getCurrentTeamContextForClient(client)).resolves.toMatchObject({
      userId: null,
      teamId: null,
      canManageMembers: false,
    });
    expect(builders).toHaveLength(0);
  });

  it("preserves a verified user and pending-request state without a membership", async () => {
    const { client } = fakeSupabase({
      membershipResult: { data: null },
      pendingRequestResult: { data: { id: "request-1" } },
    });

    await expect(getCurrentTeamContextForClient(client)).resolves.toMatchObject({
      userId: "profile-1",
      teamId: null,
      hasPendingJoinRequest: true,
    });
    await expect(getPostLoginRedirectPath(client)).resolves.toBe("/pending");
  });

  it("selects only active memberships with existing teams and prefers the newest", async () => {
    const { client, builders } = fakeSupabase({
      membershipResult: {
        data: {
          id: "member-1",
          team_id: "team-1",
          role: "owner",
          status: "active",
          teams: { id: "team-1", name: "Current Team", code: "CT-10001" },
        },
      },
      pendingRequestResult: { data: null },
    });

    const context = await getCurrentTeamContextForClient(client);
    const membershipQuery = builders.find((builder) => builder.table === "team_members");

    expect(context.teamId).toBe("team-1");
    expect(context.teamName).toBe("Current Team");
    expect(membershipQuery?.operations).toContainEqual({
      name: "select",
      args: [expect.stringContaining("custom_role_id")],
    });
    expect(membershipQuery?.operations).toContainEqual({
      name: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  it("loads custom permissions and falls back safely when joined team metadata is absent", async () => {
    const { client, builders } = fakeSupabase({
      membershipResult: {
        data: {
          id: "member-2",
          team_id: "team-2",
          role: "member",
          status: "active",
          custom_role_id: "custom-1",
          teams: null,
        },
      },
      pendingRequestResult: { data: null },
      customRoleResult: { data: { permissions: ["members.manage"] } },
    });

    const context = await getCurrentTeamContextForClient(client);
    expect(context).toMatchObject({
      teamId: "team-2",
      teamCode: null,
      canManageMembers: true,
      customPermissions: ["members.manage"],
    });
    expect(builders.find((builder) => builder.table === "custom_roles")?.operations).toContainEqual({
      name: "eq",
      args: ["id", "custom-1"],
    });
    await expect(getPostLoginRedirectPath(client)).resolves.toBe("/dashboard");
  });

  it("loads an exact team role override for authorization checks", async () => {
    const { client, builders } = fakeSupabase({
      membershipResult: {
        data: {
          id: "member-3",
          team_id: "team-3",
          role: "admin",
          status: "active",
          custom_role_id: null,
          teams: { name: "Policy Team", code: "PT-10001" },
        },
      },
      pendingRequestResult: { data: null },
      rolePermissionsResult: { data: { permissions: [] } },
    });

    await expect(getCurrentTeamContextForClient(client)).resolves.toMatchObject({
      role: "admin",
      rolePermissions: [],
      canManageMembers: false,
    });
    expect(builders.find((builder) => builder.table === "team_role_permissions")?.operations).toEqual(
      expect.arrayContaining([
        { name: "eq", args: ["team_id", "team-3"] },
        { name: "eq", args: ["role", "admin"] },
      ]),
    );
  });
});
