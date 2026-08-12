import { cn } from "@/lib/utils";

export type ChordNotation = "chords" | "nashville";

export function ChordNotationToggle({
  value,
  onChange,
  className,
}: {
  value: ChordNotation;
  onChange: (value: ChordNotation) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.04] p-1", className)}
      role="group"
      aria-label="Chord notation"
    >
      {(["chords", "nashville"] as const).map((notation) => {
        const active = value === notation;
        const label = notation === "chords" ? "Chords" : "Nashville";
        return (
          <button
            key={notation}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(notation)}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-bold transition",
              active ? "bg-violet-600 text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
