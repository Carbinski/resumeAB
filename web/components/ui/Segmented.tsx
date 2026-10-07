"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

/** Pill toggle with a sliding highlight. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const group = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-[1.75rem] bg-stone/80 p-1 shadow-[inset_0_1px_2px_rgba(64,57,38,0.08)]",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center rounded-full font-medium transition-colors duration-300",
              size === "md" ? "px-4 text-[0.85rem]" : "px-3 text-[0.78rem]",
              selected ? "text-cream" : "text-olive hover:text-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${group}-pill`}
                className="absolute inset-0 rounded-full bg-ink shadow-[0_6px_16px_-6px_rgba(42,34,28,0.6)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
