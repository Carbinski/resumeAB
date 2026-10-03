import { cn } from "@/lib/cn";

export function DeltaChip({
  delta,
  suffix,
  className,
}: {
  delta: number;
  suffix?: string;
  className?: string;
}) {
  const rounded = Math.round(delta);
  const up = rounded > 0;
  const flat = rounded === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[0.72rem] tracking-tight",
        flat && "bg-stone text-olive",
        up && "bg-bark text-cream",
        !up && !flat && "bg-blush text-clay",
        className,
      )}
    >
      {!flat && (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className={up ? "" : "rotate-180"}>
          <path d="M4 1 7.5 6.5h-7z" fill="currentColor" />
        </svg>
      )}
      {flat ? "±0" : Math.abs(rounded)}
      {suffix ? <span className="opacity-70">{suffix}</span> : null}
    </span>
  );
}
