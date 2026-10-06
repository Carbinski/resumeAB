"use client";

import { motion, type Transition } from "motion/react";
import { clamp } from "@/lib/elo";
import { cn } from "@/lib/cn";
import type { ResumeVersion } from "@/lib/types";
import type { RoleId } from "@/lib/roles";

export type BalancePhase = "setup" | "running" | "result";

const MAX_TILT = 12;
const SWAY = [0, -5, 4, -3, 2, -1, 0];

const SETTLE: Transition = { type: "spring", stiffness: 58, damping: 9, mass: 1 };
const WEIGH: Transition = { duration: 2.4, repeat: Infinity, ease: "easeInOut" };

function Pan({
  tag,
  version,
  role,
  winner,
  pending,
  counter,
  transition,
  empty,
}: {
  tag: "A" | "B";
  version: ResumeVersion | null;
  role: RoleId;
  winner: boolean;
  pending?: boolean;
  counter: number | number[];
  transition: Transition;
  empty: string;
}) {
  return (
    <motion.div
      className="absolute left-0 top-0 w-[112px] sm:w-[176px]"
      style={{ x: "-50%", originX: 0.5, originY: 0 }}
      animate={{ rotate: counter }}
      transition={transition}
    >
      <svg
        viewBox="0 0 100 48"
        className="mx-auto block h-10 w-[78%] sm:h-12"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M50 0 L6 48 M50 0 L94 48"
          stroke="#403926"
          strokeOpacity="0.5"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className={cn(
          "glass flex h-[92px] flex-col items-center justify-center rounded-[20px] px-2 text-center transition-shadow duration-700 sm:h-[104px] sm:rounded-[24px]",
          winner && "shadow-[0_0_0_2px_#BC7767,0_24px_44px_-18px_rgba(188,119,103,0.65)]",
          !version && !pending && "border-dashed",
        )}
      >
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.16em] text-olive">
          {tag}
          {version ? ` · ${version.label}` : ""}
        </p>
        {pending ? (
          <span className="mt-2 inline-flex items-center gap-2 text-[0.8rem] text-olive">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bark/20 border-t-clay" />
            Rating…
          </span>
        ) : version ? (
          <>
            <p className="font-display text-[2.1rem] leading-none text-ink sm:text-[2.7rem]">
              {version.ratings[role]}
            </p>
            <p className="mt-1 w-full truncate text-[0.68rem] text-olive">{version.fileName}</p>
          </>
        ) : (
          <p className="mt-1 max-w-[12ch] text-[0.76rem] leading-snug text-taupe">{empty}</p>
        )}
      </div>
    </motion.div>
  );
}

/** A scale that tips toward the stronger resume. Fixed height in every state. */
export function Balance({
  a,
  b,
  role,
  phase,
  pB,
  pendingB,
}: {
  a: ResumeVersion | null;
  b: ResumeVersion | null;
  role: RoleId;
  phase: BalancePhase;
  pB: number | null;
  pendingB: boolean;
}) {
  const running = phase === "running";
  const angle =
    phase === "result" && pB !== null ? clamp((pB - 0.5) * 40, -MAX_TILT, MAX_TILT) : 0;
  const winnerB = phase === "result" && pB !== null && pB >= 0.55;
  const winnerA = phase === "result" && pB !== null && pB <= 0.45;

  const beam = running ? SWAY : angle;
  const counter = running ? SWAY.map((d) => -d) : -angle;
  const transition = running ? WEIGH : SETTLE;

  return (
    <div className="relative mx-auto h-[292px] w-full max-w-[720px] sm:h-[336px]">
      <div className="absolute bottom-3 left-1/2 top-[66px] w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-ink to-bark/20 sm:top-[76px]" />
      <div className="absolute bottom-0 left-1/2 h-3 w-36 -translate-x-1/2 rounded-full bg-bark/15 blur-[3px]" />
      <div className="absolute bottom-1.5 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-bark/70" />

      <motion.div
        className="absolute inset-x-[21%] top-[66px] h-[4px] rounded-full bg-ink sm:inset-x-[14%] sm:top-[76px]"
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
            pending={pendingB}
            counter={counter}
            transition={transition}
            empty="Add the edited version"
          />
        </div>
      </motion.div>
    </div>
  );
}
