import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileIconRail } from "./mobile-icon-rail";

let originalMatchMedia: PropertyDescriptor | undefined;

const navigationItems = [
  { id: "home", href: "/dashboard", label: "Home" },
  { id: "setlists", href: "/setlists", label: "Setlists" },
  { id: "events", href: "/events", label: "Timeline" },
  { id: "messages", href: "/messages", label: "Messages" },
  { id: "members", href: "/members", label: "Team Management" },
  { id: "analytics", href: "/analytics", label: "Analytics" },
  { id: "profile", href: "/profile", label: "Profile" },
];

function mockDesktopBreakpoint() {
  let matches = false;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(min-width: 1024px)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setDesktopViewport(isDesktop: boolean) {
      matches = isDesktop;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
  originalMatchMedia = undefined;
  vi.unstubAllGlobals();
});

describe("MobileIconRail", () => {
  it("shows remaining permitted routes in the accessible More drawer", async () => {
    const user = userEvent.setup();
    render(<MobileIconRail active="Timeline" items={navigationItems} />);

    expect(screen.getByRole("navigation", { name: "Mobile bottom navigation" })).toHaveClass("lg:hidden");
    expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();

    const moreButton = screen.getByRole("button", { name: "Expand navigation" });
    await user.click(moreButton);

    expect(screen.getByRole("dialog", { name: "More Options" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team Management" })).toHaveAttribute("href", "/members");
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/analytics");
    expect(screen.getByRole("button", { name: "Close more menu" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "More Options" })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });

  it("keeps hidden routes out of the drawer when they are absent from permitted navigation", async () => {
    const user = userEvent.setup();
    render(<MobileIconRail active="Timeline" items={navigationItems.filter((item) => item.id !== "analytics")} />);

    await user.click(screen.getByRole("button", { name: "Expand navigation" }));

    expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
  });

  it("closes the drawer and moves focus into desktop navigation when the desktop breakpoint opens", async () => {
    const user = userEvent.setup();
    const desktopBreakpoint = mockDesktopBreakpoint();
    render(
      <>
        <nav aria-label="Primary">
          <a href="/dashboard">Dashboard</a>
        </nav>
        <MobileIconRail active="Timeline" items={navigationItems} />
      </>,
    );

    const moreButton = screen.getByRole("button", { name: "Expand navigation" });
    const desktopNavigationLink = screen.getByRole("link", { name: "Dashboard" });
    await user.click(moreButton);

    expect(screen.getByRole("dialog", { name: "More Options" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    act(() => desktopBreakpoint.setDesktopViewport(true));

    expect(screen.queryByRole("dialog", { name: "More Options" })).not.toBeInTheDocument();
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
    expect(desktopNavigationLink).toHaveFocus();

    act(() => desktopBreakpoint.setDesktopViewport(false));
    expect(screen.queryByRole("dialog", { name: "More Options" })).not.toBeInTheDocument();
    await user.click(moreButton);
    expect(screen.getByRole("dialog", { name: "More Options" })).toBeInTheDocument();
  });
});
