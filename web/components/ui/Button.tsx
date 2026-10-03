"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "ink" | "glass" | "outline";

const VARIANTS: Record<Variant, string> = {
  ink: "bg-ink text-cream hover:bg-bark shadow-[0_10px_24px_-10px_rgba(42,34,28,0.55)]",
  glass: "glass text-ink hover:bg-white/80",
  outline:
    "border border-bark/25 text-ink hover:bg-white/60 hover:border-bark/40",
};

export function buttonClass(variant: Variant = "ink", className?: string) {
  return cn(
    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[0.92rem] font-medium tracking-[-0.005em] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  );
}

/** Pulls its child a few pixels toward the cursor. */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });

  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType === "touch" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

export function Button({
  variant = "ink",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={buttonClass(variant, className)} {...props}>
      {children}
    </button>
  );
}
