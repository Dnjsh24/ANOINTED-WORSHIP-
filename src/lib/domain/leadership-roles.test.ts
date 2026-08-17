import { describe, expect, it } from "vitest";
import {
  LEADERSHIP_ROLES,
  SELF_SELECTABLE_MINISTRIES,
  SELF_SELECTABLE_BAND_ROLES,
  getLeadershipRole,
  isLeadershipRole,
} from "./leadership-roles";
import {
  getDisplayedMinistries,
  getMemberLeadershipRole,
} from "./member-ministries";

describe("Leadership Roles Domain", () => {
  it("defines all required leadership roles including Worship Team Chairman", () => {
    const keys = LEADERSHIP_ROLES.map((r) => r.key);
    expect(keys).toContain("worship_team_chairman");
    expect(keys).toContain("worship_leader");
    expect(keys).toContain("band_leader");
    expect(keys).toContain("vocal_director");
    expect(keys).toContain("dance_leader");
    expect(keys).toContain("media_leader");
    expect(keys).toContain("pastor");
  });

  it("identifies leadership role keys and labels correctly", () => {
    expect(getLeadershipRole("worship_team_chairman")?.label).toBe("Worship Team Chairman");
    expect(getLeadershipRole("Worship Team Chairman")?.key).toBe("worship_team_chairman");
    expect(getLeadershipRole("Band Leader / Music Director")?.key).toBe("band_leader");
    expect(getLeadershipRole("Vocal Director")?.key).toBe("vocal_director");
    expect(isLeadershipRole("worship_team_chairman")).toBe(true);
    expect(isLeadershipRole("Singer / Member")).toBe(false);
    expect(isLeadershipRole("Acoustic Guitar")).toBe(false);
  });

  it("excludes ushers/greeters and vocals from self-selectable ministries and band roles", () => {
    expect(SELF_SELECTABLE_MINISTRIES as unknown as string[]).not.toContain("Ushers / Greeters");
    expect(SELF_SELECTABLE_MINISTRIES as unknown as string[]).not.toContain("Ushers");
    expect(SELF_SELECTABLE_BAND_ROLES as unknown as string[]).not.toContain("Vocals");
    expect(SELF_SELECTABLE_MINISTRIES).toEqual([
      "Band Member",
      "Media & Tech",
      "Dance Ministry",
      "Singer / Member",
    ]);
    expect(SELF_SELECTABLE_BAND_ROLES).toEqual([
      "Acoustic Guitar",
      "Electric Guitar",
      "Bass",
      "Drums",
      "Main Keys",
      "Second Keys",
    ]);
  });

  it("extracts the leadership role from member's role or ministries", () => {
    // Direct role
    expect(getMemberLeadershipRole("worship_leader", [])?.key).toBe("worship_leader");
    // Ministries tag (e.g. Worship Team Chairman)
    expect(getMemberLeadershipRole("admin", ["Worship Team Chairman", "Singer / Member"])?.key).toBe("worship_team_chairman");
    expect(getMemberLeadershipRole("member", ["Vocal Director", "Singer / Member"])?.key).toBe("vocal_director");
    // Regular member with no leadership
    expect(getMemberLeadershipRole("member", ["Singer / Member", "Band Member"])).toBeNull();
  });

  it("filters leadership tags out of general ministry badges", () => {
    const ministries = ["Worship Team Chairman", "Singer / Member", "Acoustic Guitar"];
    const displayed = getDisplayedMinistries(ministries, "admin");
    expect(displayed).toEqual(["Singer / Member", "Acoustic Guitar"]);
    expect(displayed).not.toContain("Worship Team Chairman");
  });
});
