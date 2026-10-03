"use client";

import { motion, type Transition } from "motion/react";
import { clamp } from "@/lib/elo";
import { cn } from "@/lib/cn";
import type { ResumeVersion } from "@/lib/types";
import type { RoleId } from "@/lib/roles";

type Phase = "setup" | "running" | "result";

function Pan({
  tag,
  version,
  role,
  winner,
  counter,
  transition,
  empty,
}: {
  tag: "A" | "B";
  version: ResumeVersion | null;
  role: RoleId;
  winner: boolean;
  counter: number | number[];
  transition: Transition;
  empty: string;
}) {
  return (
    <motion.div
      className="absolute left-0 top-0 w-[132px] sm:w-[188px]"
      style={{ x: "-50%", originX: 0.5, originY: 0 }}
      animate={{ rotate: counter }}
      transition={transition}
    >
      <svg viewBox="0 0 100 64" className="mx-auto block h-14 w-full" preserveAspectRatio="none" aria-hidden>
        <path
          d="M50 0 L10 64 M50 0 L90 64"
          stroke="#403926"
          strokeOpacity="0.55"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className={cn(
          "glass rounded-[22px] px-3 py-3 text-center transition-shadow duration-700 sm:px-4",
          winner && "shadow-[0_0_0_2px_#BC7767,0_24px_48px_-20px_rgba(188,119,103,0.6)]",
          !version && "border-dashed",
        )}
      >
        <p className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-olive">
          {tag}
          {version ? ` · ${version.label}` : ""}
        </p>
        {version ? (
          <>
            <p className="font-display mt-1 text-[2.3rem] leading-none text-ink sm:text-[2.9rem]">
              {version.ratings[role]}
            </p>
            <p className="mt-1.5 truncate text-[0.7rem] text-olive">{version.fileName}</p>
          </>
        ) : (
          <p className="mx-auto mt-2 max-w-[11ch] py-3 text-[0.82rem] leading-snug text-taupe">
            {empty}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/** The A/B lab's centrepiece: a scale that tips toward the stronger résumé. */
export function Balance({
  a,
  b,
  role,
  phase,
  pB,
}: {
  a: ResumeVersion | null;
  b: ResumeVersion | null;
  role: RoleId;
  phase: Phase;
  pB: number | null;
}) {
  const angle = phase === "result" && pB !== null ? clamp((pB - 0.5) * 55, -16, 16) : 0;
  const winnerB = phase === "result" && pB !== null && pB >= 0.55;
  const winnerA = phase === "result" && pB !== null && pB <= 0.45;

  const sway = [0, -7, 6, -4, 3, -1, 0];
  const running = phase === "running";
  const beam = running ? sway : angle;
  const counter = running ? sway.map((d) => -d) : -angle;
  const transition: Transition = running
    ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
    : { type: "spring", stiffness: 38, damping: 5.5, mass: 1.1 };

  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[760px] sm:h-[400px]" aria-hidden={false}>
      <div className="absolute bottom-0 left-1/2 top-[96px] w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-ink to-bark/30" />
      <div className="absolute bottom-0 left-1/2 h-3 w-40 -translate-x-1/2 rounded-full bg-bark/15 blur-[2px]" />

      <motion.div
        className="absolute inset-x-[16%] top-[96px] h-[4px] rounded-full bg-ink sm:inset-x-[9%]"
        animate={{ rotate: beam }}
        transition={transition}
      >
        <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-cream bg-clay shadow" />
        <div className="absolute left-0 top-1/2">
          <Pan
            tag="A"
            version={a}
            role={role}
            winner={winnerA}
            counter={counter}
            transition={transition}
            empty="Pick a baseline"
          />
        </div>
        <div className="absolute right-0 top-1/2">
          <Pan
            tag="B"
            version={b}
            role={role}
            winner={winnerB}
            counter={counter}
            transition={transition}
            empty="Add the edited version"
          />
        </div>
      </motion.div>
    </div>
  );
}
