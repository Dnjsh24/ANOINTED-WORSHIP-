import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultPresentationSettings } from "@/lib/domain/presentation";
import { ProjectorBackground } from "./projector-background";

describe("ProjectorBackground", () => {
  it("renders the global video background", () => {
    render(
      <ProjectorBackground
        settings={{
          ...defaultPresentationSettings,
          backgroundMediaUrl: "/background.mp4",
          backgroundMediaType: "video",
        }}
        slideSettings={null}
      />,
    );

    expect(screen.getByTestId("projector-background-video")).toHaveAttribute("src", "/background.mp4");
  });

  it("renders the global image background", () => {
    render(
      <ProjectorBackground
        settings={{
          ...defaultPresentationSettings,
          backgroundMediaUrl: "/background.jpg",
          backgroundMediaType: "image",
        }}
        slideSettings={null}
      />,
    );

    expect(screen.getByTestId("projector-background-image")).toHaveAttribute("src", "/background.jpg");
  });

  it("uses a slide image instead of the global media", () => {
    render(
      <ProjectorBackground
        settings={{
          ...defaultPresentationSettings,
          backgroundMediaUrl: "/background.mp4",
          backgroundMediaType: "video",
        }}
        slideSettings={{ backgroundType: "image", backgroundValue: "/slide.jpg" }}
      />,
    );

    expect(screen.queryByTestId("projector-background-video")).not.toBeInTheDocument();
    expect(screen.getByTestId("projector-background-image")).toHaveAttribute("src", "/slide.jpg");
  });

  it("uses slide colors and gradients without trying to load them as media", () => {
    const view = render(
      <ProjectorBackground
        settings={{
          ...defaultPresentationSettings,
          backgroundMediaUrl: "/background.mp4",
          backgroundMediaType: "video",
        }}
        slideSettings={{ backgroundType: "color", backgroundValue: "#123456" }}
      />,
    );

    expect(screen.getByTestId("projector-background")).toHaveStyle({ backgroundColor: "#123456" });
    expect(screen.queryByTestId("projector-background-video")).not.toBeInTheDocument();

    view.rerender(
      <ProjectorBackground
        settings={defaultPresentationSettings}
        slideSettings={{ backgroundType: "gradient", backgroundValue: "linear-gradient(red, blue)" }}
      />,
    );
    expect(screen.getByTestId("projector-background").style.background).toContain("linear-gradient");
  });
});
