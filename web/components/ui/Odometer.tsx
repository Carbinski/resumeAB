"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ digit }: { digit: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block h-[1.08em] w-[0.5em] overflow-hidden text-center align-baseline leading-[1.08]"
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={{ type: "spring", stiffness: 70, damping: 17, mass: 0.9 }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1.08em]">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Rolling-digit number. Rolls up from zero the first time it scrolls into view. */
export function Odometer({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const shown = inView ? Math.max(0, Math.round(value)) : 0;
  const chars = String(shown).padStart(String(Math.round(value)).length, "0").split("");

  return (
    <span
      ref={ref}
      role="text"
      aria-label={String(Math.round(value))}
      className={cn("inline-flex items-baseline", className)}
    >
      {chars.map((c, i) => (
        <Digit key={chars.length - i} digit={Number(c)} />
      ))}
    </span>
  );
}
