import type { WoolyPose } from "@/lib/domain/wooly";

export type WoolyMotionPose = WoolyPose | "walking" | "standing-talking";

export function getWoolyStillSource(pose: WoolyMotionPose): string {
  if (pose === "pointing") return "/brand/wooly/whole-pointing-v1.webp";
  const still = pose === "walking" || pose === "listening" || pose === "standing-talking" ? "neutral" : "wave-closed";
  return `/brand/wooly/whole-${still}-v2.webp`;
}
