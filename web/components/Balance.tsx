"use client";

import { motion, type Transition } from "motion/react";
import { ELO_SCALE, clamp } from "@/lib/elo";
import { cn } from "@/lib/cn";
import type { ResumeVersion } from "@/lib/types";
import type { RoleId } from "@/lib/roles";

export type BalancePhase = "setup" | "running" | "result";

/** One Elo scale step (10-to-1) is a full, obvious tip. */
const MAX_TILT = 18;
const SWAY = [0, -5, 4, -3, 2, -1, 0];

const SETTLE: Transition = { type: "spring", stiffness: 58, damping: 9, mass: 1 };
const WEIGH: Transition = { duration: 2.4, repeat: Infinity, ease: "easeInOut" };

/** The number actually drawn on a pan, or null when that side is not numeric. */
function shownScore(
  version: ResumeVersion | null,
  role: RoleId,
  judged: number | null,
  pending: boolean,
): number | null {
  if (!version || pending) return null;
  if (judged != null) return Math.round(judged);
  const rating = version.ratings[role];
  return rating == null ? null : Math.round(rating);
}

/** Positive degrees sink the right pan, so the higher score is heavier. */
function tiltFor(left: number, right: number): number {
  return clamp(((right - left) / ELO_SCALE) * MAX_TILT, -MAX_TILT, MAX_TILT);
}

function Pan({
  tag,
  version,
  score,
  winner,
  pending,
  counter,
  transition,
  empty,
}: {
  tag: "A" | "B";
  version: ResumeVersion | null;
  score: number | null;
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
        <p className="w-full truncate px-2 font-mono text-[0.64rem] uppercase tracking-[0.16em] text-olive">
          {tag}
          {version ? ` · ${version.label}` : ""}
        </p>
        {pending ? (
          <span className="mt-2 inline-flex items-center gap-2 text-[0.8rem] text-olive">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bark/20 border-t-clay" />
            Rating…
          </span>
        ) : score != null ? (
          <>
            <p className="font-display text-[2.1rem] leading-none text-ink sm:text-[2.7rem]">
              {score}
            </p>
            {version ? (
              <p className="mt-1 w-full truncate text-[0.68rem] text-olive">{version.fileName}</p>
            ) : null}
          </>
        ) : version ? (
          <p className="mt-2 text-[0.78rem] leading-snug text-taupe">Not rated for this role</p>
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
  eloA = null,
  eloB = null,
}: {
  a: ResumeVersion | null;
  b: ResumeVersion | null;
  role: RoleId;
  phase: BalancePhase;
  pB: number | null;
  pendingB: boolean;
  /** Scores from the comparison, once that result exists for the judged role. */
  eloA?: number | null;
  eloB?: number | null;
}) {
  const running = phase === "running";
  const scoreA = shownScore(a, role, eloA, false);
  const scoreB = shownScore(b, role, eloB, pendingB);
  const settled = scoreA != null && scoreB != null ? tiltFor(scoreA, scoreB) : 0;
  const winnerB = phase === "result" && pB !== null && pB >= 0.55;
  const winnerA = phase === "result" && pB !== null && pB <= 0.45;

  const beam = running ? SWAY : settled;
  const counter = running ? SWAY.map((d) => -d) : -settled;
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
            score={scoreA}
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
            score={scoreB}
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
