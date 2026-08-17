import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PresenterClient from "./presenter-client";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("PresenterClient Resilience", () => {
  it("renders smoothly without blocking or erroring when setlists array is empty", () => {
    render(<PresenterClient setlists={[]} desktopMode />);

    // Should NOT show the old blocking raw text error
    expect(screen.queryByText("No upcoming setlists found.")).toBeNull();

    // Should render the Presenter header and fallback setlist name
    expect(screen.getByText("Presenter")).toBeInTheDocument();
    expect(screen.getByText(/Quick Presentation/i)).toBeInTheDocument();

    // Should render empty lineup message
    expect(screen.getByText("No songs in setlist")).toBeInTheDocument();

    // Should render the standby ready panel
    expect(screen.getByText("Presenter Ready")).toBeInTheDocument();
    expect(screen.getByText("📖 Bible Search")).toBeInTheDocument();
  });
});
