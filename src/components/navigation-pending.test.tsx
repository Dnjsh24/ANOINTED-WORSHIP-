import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationPending } from "./navigation-pending";

const state = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => state }));

describe("navigation feedback", () => {
  beforeEach(() => { state.pending = false; });
  it("announces pending navigation and clears the announcement when finished", () => {
    const view = render(<NavigationPending />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    state.pending = true;
    view.rerender(<NavigationPending />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening page");
    state.pending = false;
    view.rerender(<NavigationPending />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
