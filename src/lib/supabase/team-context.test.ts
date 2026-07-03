import { describe, expect, it } from "vitest";
import { getCurrentTeamContextForClient } from "@/lib/supabase/team-context";
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
}

function fakeSupabase({
  membershipResult,
  pendingRequestResult,
}: {
  membershipResult: QueryResult;
  pendingRequestResult: QueryResult;
}) {
  const builders: FakeQueryBuilder[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "profile-1" },
        },
      }),
    },
    from: (table: string) => {
      const builder = new FakeQueryBuilder(
        table,
        table === "team_members" ? membershipResult : pendingRequestResult,
      );
      builders.push(builder);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, builders };
}

describe("getCurrentTeamContextForClient", () => {
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
      args: ["id, team_id, role, status, teams!inner (id, name, code)"],
    });
    expect(membershipQuery?.operations).toContainEqual({
      name: "order",
      args: ["created_at", { ascending: false }],
    });
  });
});
