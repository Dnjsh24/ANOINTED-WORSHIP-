import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("falls back to initials when a profile image cannot load", () => {
    render(<Avatar name="Dan Jeshua" src="https://lh3.googleusercontent.com/avatar.jpg" />);

    fireEvent.error(screen.getByRole("img", { name: "Dan Jeshua" }));

    expect(screen.queryByRole("img", { name: "Dan Jeshua" })).not.toBeInTheDocument();
    expect(screen.getByText("DJ")).toBeVisible();
  });

  it("tries a replacement URL after an earlier image failed", () => {
    const { rerender } = render(<Avatar name="Dan Jeshua" src="https://example.invalid/old.jpg" />);
    fireEvent.error(screen.getByRole("img", { name: "Dan Jeshua" }));

    rerender(<Avatar name="Dan Jeshua" src="https://lh3.googleusercontent.com/new.jpg" />);

    expect(screen.getByRole("img", { name: "Dan Jeshua" })).toHaveAttribute(
      "src",
      "https://lh3.googleusercontent.com/new.jpg",
    );
  });
});
