import type { EventType } from "@/lib/types";
import { cn } from "@/lib/utils";

type BadgeType = Exclude<EventType, "service_rehearsal">;

const badgeConfig: Record<BadgeType, { label: string; className: string }> = {
  service: {
    label: "Service",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  rehearsal: {
    label: "Rehearsal",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  meeting: {
    label: "Meeting",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  special_event: {
    label: "Special Event",
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  },
};

export function EventTypeBadges({ eventType }: { eventType: EventType }) {
  const badgeTypes: BadgeType[] = eventType === "service_rehearsal"
    ? ["service", "rehearsal"]
    : [eventType];

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Event types">
      {badgeTypes.map((badgeType) => {
        const badge = badgeConfig[badgeType];
        return (
          <span
            key={badgeType}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-tight",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        );
      })}
    </span>
  );
}
