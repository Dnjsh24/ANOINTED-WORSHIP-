import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MobileIconRail } from "./mobile-icon-rail";

const navigationItems = [
  { id: "home", href: "/dashboard", label: "Home" },
  { id: "setlists", href: "/setlists", label: "Setlists" },
  { id: "events", href: "/events", label: "Timeline" },
  { id: "messages", href: "/messages", label: "Messages" },
  { id: "members", href: "/members", label: "Team Management" },
  { id: "analytics", href: "/analytics", label: "Analytics" },
  { id: "profile", href: "/profile", label: "Profile" },
];

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
});
