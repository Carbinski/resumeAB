"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Rotates through progress copy. Mount it when work starts and unmount it when
 * the work ends; it restarts from the first step each time it mounts.
 */
export function StepTicker({
  steps,
  intervalMs = 700,
  showCount = false,
  className,
}: {
  steps: readonly string[];
  intervalMs?: number;
  showCount?: boolean;
  className?: string;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, steps.length - 1)),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [steps.length, intervalMs]);

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="relative h-7 flex-1 overflow-hidden text-[1.02rem] text-ink">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={step}
            className="absolute inset-x-0 top-0"
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -22, opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {steps[step]}…
          </motion.p>
        </AnimatePresence>
      </div>
      {showCount ? (
        <span className="font-mono text-[0.72rem] text-olive">
          {step + 1}/{steps.length}
        </span>
      ) : null}
    </div>
  );
}
