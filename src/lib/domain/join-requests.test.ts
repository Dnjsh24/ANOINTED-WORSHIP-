import { describe, expect, it } from "vitest";
import {
  formatRoleLabel,
  joinRequestWithRequesterProfileSelect,
  normalizeJoinRequest,
} from "@/lib/domain/join-requests";

describe("join request helpers", () => {
  it("selects the requester profile through the non-ambiguous foreign key", () => {
    expect(joinRequestWithRequesterProfileSelect).toContain(
      "profiles:profiles!join_requests_profile_id_fkey",
    );
    expect(joinRequestWithRequesterProfileSelect).not.toContain("profiles (");
  });

  it("normalizes requests with requester profile details", () => {
    expect(
      normalizeJoinRequest({
        id: "request-1",
        profile_id: "profile-1",
        requested_role: "band_member",
        created_at: "2026-07-03T05:56:23.485Z",
        profiles: {
          id: "profile-1",
          full_name: "Danjeshua Fiscal",
          email: "danjeshua@example.com",
          avatar_url: "https://example.com/avatar.png",
        },
      }),
    ).toMatchObject({
      id: "request-1",
      name: "Danjeshua Fiscal",
      email: "danjeshua@example.com",
      ministry: "Band Member",
      requestedRole: "band_member",
    });
  });

  it("formats missing roles as members", () => {
    expect(formatRoleLabel(null)).toBe("Member");
  });
});
