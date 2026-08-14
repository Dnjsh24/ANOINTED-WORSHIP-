import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desktopMode: false,
  redirectError: new Error("NEXT_REDIRECT"),
}));

vi.mock("@/lib/desktop/runtime", () => ({
  isDesktopRuntime: () => mocks.desktopMode,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw mocks.redirectError;
  }),
}));

import { redirect } from "next/navigation";
import Home from "./page";

describe("root startup routing", () => {
  beforeEach(() => {
    mocks.desktopMode = false;
    vi.mocked(redirect).mockClear();
  });

  it("opens the dashboard when the root route runs in the desktop app", () => {
    mocks.desktopMode = true;

    expect(() => Home()).toThrow(mocks.redirectError);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps rendering the public landing page on the hosted website", () => {
    const page = Home();

    expect(page).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
