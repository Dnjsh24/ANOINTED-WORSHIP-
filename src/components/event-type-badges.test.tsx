import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTypeBadges } from "@/components/event-type-badges";

describe("EventTypeBadges", () => {
  it("separates a service with rehearsal into two differently colored badges", () => {
    render(<EventTypeBadges eventType="service_rehearsal" />);

    const badges = within(screen.getByRole("group", { name: "Event types" }));
    expect(badges.getByText("Service")).toHaveClass("text-emerald-300");
    expect(badges.getByText("Rehearsal")).toHaveClass("text-amber-300");
    expect(badges.queryByText("Service Rehearsal")).not.toBeInTheDocument();
  });

  it("keeps a service-only event as one badge", () => {
    render(<EventTypeBadges eventType="service" />);

    expect(screen.getByText("Service")).toHaveClass("text-emerald-300");
    expect(screen.queryByText("Rehearsal")).not.toBeInTheDocument();
  });
});
