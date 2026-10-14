import { describe, expect, it } from "vitest";
import { getWoolyPointer } from "./wooly-target-pointer";

describe("Wooly target pointer", () => {
  it("points from the panel edge to the nearest target edge", () => {
    expect(getWoolyPointer(new DOMRect(20, 40, 100, 40), new DOMRect(200, 20, 100, 100))).toEqual({ startX: 200, startY: 70, targetX: 120, targetY: 70 });
    expect(getWoolyPointer(new DOMRect(20, 20, 100, 40), new DOMRect(0, 160, 320, 200))).toEqual({ startX: 120, startY: 160, targetX: 120, targetY: 60 });
  });
  it("omits an arrow when the target and panel overlap", () => {
    expect(getWoolyPointer(new DOMRect(0, 0, 300, 200), new DOMRect(20, 20, 100, 100))).toBeNull();
  });
});
