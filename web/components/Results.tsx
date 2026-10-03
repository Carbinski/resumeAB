"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { CATEGORY_BY_ID, OVERALL, type CategoryId } from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
  TIE_BAND,
  formatPercent,
  orderAgreement,
  pBInOrder,
  verdictFor,
} from "@/lib/elo";
import { ROLE_BY_ID } from "@/lib/roles";
import type { CompareResult } from "@/lib/types";
import { CategoryGlyph } from "./ui/CategoryGlyph";
import { DeltaChip } from "./ui/DeltaChip";
import { EASE } from "./ui/Reveal";

export function Verdict({ result }: { result: CompareResult }) {
  const verdict = verdictFor(result.pB);
  const role = ROLE_BY_ID[result.role];
  const forRole = result.role === "overall" ? "" : ` for ${role.label}`;
  const winPct = formatPercent(verdict === "a" ? 1 - result.pB : result.pB);

  const headline =
    verdict === "b" ? (
      <>
        B is <em className="text-clay">stronger.</em>
      </>
    ) : verdict === "a" ? (
      <>
        A is <em className="text-clay">stronger.</em>
      </>
    ) : (
      <>
        Too close to <em className="text-clay">call.</em>
      </>
    );

  const advice =
    verdict === "b"
      ? "This change helped. It is worth keeping."
      : verdict === "a"
        ? "This change cost you points. Consider reverting it."
        : "Not enough signal either way. Try a bolder edit.";

  const detail =
    verdict === "tie"
      ? `Split ${formatPercent(1 - result.pB)} to ${formatPercent(result.pB)}${forRole}.`
      : `${verdict === "b" ? "B" : "A"} comes out ahead in ${winPct} of head-to-head matchups${forRole}.`;

  return (
    <div className="text-center">
      <motion.h3
        className="font-display text-[clamp(3rem,8vw,6rem)] leading-[0.92] text-ink"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE }}
      >
        {headline}
      </motion.h3>
      <motion.div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
      >
        <DeltaChip delta={result.eloB - result.eloA} suffix="ELO for B" />
        <span className="text-[1rem] text-olive">{detail}</span>
      </motion.div>
      <motion.p
        className="mt-1.5 text-[0.92rem] text-taupe"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        {advice}
      </motion.p>
    </div>
  );
}

function DuelRow({
  label,
  glyph,
  color,
  pB,
  featured,
  index,
  hint,
}: {
  label: string;
  glyph?: CategoryId;
  color: string;
  pB: number;
  featured?: boolean;
  index: number;
  hint?: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const verdict = verdictFor(pB);
  const pA = 1 - pB;
  const bWins = verdict === "b";
  const aWins = verdict === "a";

  const bar = (win: boolean) =>
    win ? color : verdict === "tie" ? "#AF9D8F" : "#D3BCB0";

  return (
    <li
      ref={ref}
      className={cn(
        featured && "rounded-[26px] bg-white/55 p-4 sm:p-6",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex items-center gap-2.5 text-ink",
            featured ? "font-display text-[1.7rem] leading-none" : "text-[0.92rem]",
          )}
          title={hint}
        >
          {glyph ? (
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-cream"
              style={{ background: color }}
            >
              <CategoryGlyph id={glyph} className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {label}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em]",
            verdict === "tie" ? "bg-stone text-olive" : "bg-ink text-cream",
          )}
        >
          {verdict === "tie" ? "Even" : verdict === "b" ? "B wins" : "A wins"}
        </span>
      </div>

      <div className={cn("relative mt-3 flex items-center", featured ? "h-5" : "h-3")}>
        <div className="flex h-full w-1/2 justify-end overflow-hidden rounded-l-full bg-bark/[0.07]">
          <motion.div
            className="h-full rounded-l-full"
            style={{ background: bar(aWins) }}
            initial={{ width: 0 }}
            animate={{ width: inView ? `${pA * 100}%` : 0 }}
            transition={{ duration: 1.2, ease: EASE, delay: index * 0.08 }}
          />
        </div>
        <span className="z-10 h-[170%] w-[2px] bg-cream" aria-hidden />
        <div className="flex h-full w-1/2 justify-start overflow-hidden rounded-r-full bg-bark/[0.07]">
          <motion.div
            className="h-full rounded-r-full"
            style={{ background: bar(bWins) }}
            initial={{ width: 0 }}
            animate={{ width: inView ? `${pB * 100}%` : 0 }}
            transition={{ duration: 1.2, ease: EASE, delay: index * 0.08 }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[0.7rem]">
        <span className={aWins ? "text-ink" : "text-olive"}>A {formatPercent(pA)}</span>
        <span className={bWins ? "text-ink" : "text-olive"}>{formatPercent(pB)} B</span>
      </div>
    </li>
  );
}

export function Duels({ result }: { result: CompareResult }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h4 className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
          Quality by quality
        </h4>
        <span className="font-mono text-[0.7rem] text-taupe">P(stronger)</span>
      </div>
      <ul className="mt-4 space-y-5">
        <DuelRow
          featured
          index={0}
          label={OVERALL.label}
          color="#2A221C"
          pB={result.pB}
          hint={OVERALL.definition}
        />
        {result.categories.map((duel, i) => {
          const def = CATEGORY_BY_ID[duel.id];
          return (
            <DuelRow
              key={duel.id}
              index={i + 1}
              label={def.label}
              glyph={def.id}
              color={def.color}
              pB={duel.pB}
              hint={def.definition}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** Both left/right orders, shown side by side so position bias is visible. */
export function PositionCheck({ result }: { result: CompareResult }) {
  const agreement = orderAgreement(result.orders);
  const consistent = agreement >= 0.9;
  const points = result.orders.map((o) => pBInOrder(o));
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
          Position check
        </h4>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em]",
            consistent ? "bg-bark text-cream" : "bg-blush text-clay",
          )}
        >
          {consistent ? "Consistent" : "Slight bias"}
        </span>
      </div>
      <p className="mt-3 text-[0.88rem] leading-relaxed text-olive">
        Each résumé is shown on the left once and on the right once, so a
        lean toward one side {`can't`} decide the result. Both readings agree{" "}
        <span className="text-ink">{formatPercent(agreement)}</span>.
      </p>

      <div className="relative mt-7 h-12">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-bark/10" />
        <motion.div
          className="absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full bg-rose"
          initial={{ left: "50%", width: 0 }}
          animate={{
            left: inView ? `${lo * 100}%` : "50%",
            width: inView ? `${(hi - lo) * 100}%` : 0,
          }}
          transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
        />
        <span className="absolute left-1/2 top-1/2 h-5 w-px -translate-y-1/2 bg-bark/30" aria-hidden />
        {points.map((p, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink font-mono text-[0.62rem] text-cream"
            initial={{ left: "50%" }}
            animate={{ left: inView ? `${p * 100}%` : "50%" }}
            transition={{ type: "spring", stiffness: 70, damping: 14, delay: 0.3 + i * 0.15 }}
          >
            {i + 1}
          </motion.span>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.66rem] text-taupe">
        <span>A stronger</span>
        <span>B stronger</span>
      </div>

      <ol className="mt-5 space-y-1.5 font-mono text-[0.72rem] text-olive">
        {result.orders.map((o, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>
              <span className="text-ink">{i + 1}</span> · {o.left === "a" ? "A left, B right" : "B left, A right"}
            </span>
            <span>
              B {formatPercent(pBInOrder(o))}
              {Math.abs(pBInOrder(o) - 0.5) < TIE_BAND ? " · even" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
