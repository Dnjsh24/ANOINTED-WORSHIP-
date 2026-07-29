import type { CSSProperties } from "react";
import type { PresentationSettings } from "@/lib/domain/presentation";

export type ProjectorSlideBackground = {
  backgroundType?: string;
  backgroundValue?: string;
} | null;

export function ProjectorBackground({
  settings,
  slideSettings,
}: {
  settings: PresentationSettings;
  slideSettings: ProjectorSlideBackground;
}) {
  const hasSlideOverride = Boolean(slideSettings?.backgroundType && slideSettings.backgroundValue);
  const mediaUrl = slideSettings?.backgroundType === "image"
    ? slideSettings.backgroundValue
    : hasSlideOverride
      ? undefined
      : settings.backgroundMediaUrl;
  const mediaType = slideSettings?.backgroundType === "image"
    ? "image"
    : settings.backgroundMediaType;
  const backgroundStyle: CSSProperties = {
    backgroundColor: settings.backgroundColor,
  };

  if (slideSettings?.backgroundType === "color") {
    backgroundStyle.backgroundColor = slideSettings.backgroundValue;
  } else if (slideSettings?.backgroundType === "gradient") {
    backgroundStyle.background = slideSettings.backgroundValue;
  }

  return (
    <div
      data-testid="projector-background"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={backgroundStyle}
    >
      {mediaUrl && (mediaType === "video" ? (
        <video
          data-testid="projector-background-video"
          src={mediaUrl}
          className="h-full w-full object-cover opacity-80"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="projector-background-image"
          src={mediaUrl}
          className="h-full w-full object-cover opacity-80"
          alt="Background"
        />
      ))}
    </div>
  );
}
