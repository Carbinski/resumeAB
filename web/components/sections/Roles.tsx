"use client";

import { motion, useInView } from "motion/react";
import { useId, useRef, useState } from "react";
import { ELO_CENTER, beatsAverage, formatPercent } from "@/lib/elo";
import { cn } from "@/lib/cn";
import { ROLES, type RoleId } from "@/lib/roles";
import { useLadder } from "../LadderProvider";
import { Button } from "../ui/Button";
import { DeltaChip } from "../ui/DeltaChip";
import { Odometer } from "../ui/Odometer";
import { EASE, Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";
import { Sparkline } from "../ui/Sparkline";

const RAIL_MIN = 880;
const RAIL_MAX = 1240;
const pct = (elo: number) =>
  `${Math.min(100, Math.max(0, ((elo - RAIL_MIN) / (RAIL_MAX - RAIL_MIN)) * 100))}%`;

function Rung({
  roleId,
  selected,
  onSelect,
  highlightId,
  index,
}: {
  roleId: RoleId;
  selected: boolean;
  onSelect: () => void;
  highlightId: string;
  index: number;
}) {
  const { history } = useLadder();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const role = ROLES.find((r) => r.id === roleId)!;
  const series = history.map((v) => v.ratings[roleId]);
  const now = series[series.length - 1];
  const start = series[0];

  return (
    <div ref={ref} className="relative">
      {selected && (
        <motion.span
          layoutId={highlightId}
          className="glass absolute -inset-x-2 -inset-y-1 rounded-[28px] sm:-inset-x-4"
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        />
      )}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="relative block w-full rounded-[24px] py-5 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full border transition-colors",
                  selected ? "border-ink" : "border-bark/30",
                )}
              >
                <motion.span
                  className="h-2.5 w-2.5 rounded-full bg-clay"
                  initial={false}
                  animate={{ scale: selected ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                />
              </span>
              <span className="font-display text-[clamp(1.7rem,3.4vw,2.3rem)] leading-none text-ink">
                {role.label}
              </span>
            </div>
            <p className="mt-2 max-w-sm pl-8 text-[0.86rem] leading-snug text-olive">
              {role.blurb}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Odometer
              value={now}
              className="font-display text-[clamp(2.4rem,5vw,3.4rem)] leading-none text-ink"
            />
            <DeltaChip delta={now - start} suffix="all time" />
          </div>
        </div>

        <div className="mt-5 pl-8">
          <div className="relative h-[6px] rounded-full bg-bark/10">
            <motion.div
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-rose to-clay"
              initial={{ left: pct(start), width: 0 }}
              animate={{
                left: pct(Math.min(start, now)),
                width: inView ? `calc(${pct(Math.max(start, now))} - ${pct(Math.min(start, now))})` : 0,
              }}
              transition={{ duration: 1.3, ease: EASE, delay: 0.2 + index * 0.1 }}
            />
            <span
              className="absolute -top-[5px] h-4 w-px bg-bark/40"
              style={{ left: pct(ELO_CENTER) }}
              aria-hidden
            />
            <motion.span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-cream bg-ink shadow"
              initial={{ left: pct(start) }}
              animate={{ left: inView ? pct(now) : pct(start) }}
              transition={{ duration: 1.3, ease: EASE, delay: 0.2 + index * 0.1 }}
            />
          </div>
          <div className="relative mt-2 h-4 font-mono text-[0.66rem] text-taupe">
            <span className="absolute left-0">{RAIL_MIN}</span>
            <span className="absolute -translate-x-1/2" style={{ left: pct(ELO_CENTER) }}>
              avg {ELO_CENTER}
            </span>
            <span className="absolute right-0">{RAIL_MAX}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-8 text-[0.82rem] text-olive">
          <span>
            Beats the average résumé{" "}
            <span className="text-ink">{formatPercent(beatsAverage(now))}</span> of the time
          </span>
          <Sparkline values={series} width={110} height={26} stroke={selected ? "#BC7767" : "#AF9D8F"} />
        </div>
      </button>
    </div>
  );
}

function AddRole() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const fieldId = useId();

  return (
    <div className="rounded-[32px] border border-dashed border-bark/25 bg-white/35 p-5 sm:p-7">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
        Add a role
      </p>
      <h3 className="font-display mt-2 text-[1.9rem] leading-[1.05] text-ink">
        Aiming somewhere <em className="text-clay">specific?</em>
      </h3>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-olive">
        Paste a job description and {`we'll`} rate your latest version against it.
      </p>
      <label htmlFor={fieldId} className="sr-only">
        Job description
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder="Senior ML Engineer, Search Relevance. You will own ranking models end to end…"
        className="mt-4 w-full resize-none rounded-2xl border border-bark/15 bg-cream/70 p-4 text-[0.9rem] leading-relaxed text-ink outline-none transition-colors placeholder:text-taupe focus:border-clay"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button
          type="button"
          disabled={text.trim().length < 20}
          onClick={() => setSaved(true)}
        >
          Rate for this role
        </Button>
        <span className="font-mono text-[0.7rem] text-taupe">{text.trim().length} chars</span>
      </div>
      {saved && (
        <motion.p
          role="status"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl bg-peach/70 p-3 text-[0.82rem] leading-snug text-bark"
        >
          Preview only: custom roles will appear on the ladder once the rating
          engine is connected.
        </motion.p>
      )}
    </div>
  );
}

export function Roles() {
  const { role, setRole } = useLadder();
  const highlightId = useId();

  return (
    <section id="roles" className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-8 md:pb-28">
      <SectionHeader
        index="03"
        label="Role lens"
        title={
          <>
            One résumé, <em className="text-clay">different markets.</em>
          </>
        }
      >
        The same document reads differently to an ML team than to a platform
        team. Pick a lens and the chart above follows.
      </SectionHeader>

      <div className="mt-12 grid gap-8 md:mt-16 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-8">
          <div role="radiogroup" aria-label="Role" className="divide-y divide-bark/10">
            {ROLES.map((r, i) => (
              <div key={r.id} className="py-1">
                <Rung
                  roleId={r.id}
                  selected={role === r.id}
                  onSelect={() => setRole(r.id)}
                  highlightId={highlightId}
                  index={i}
                />
              </div>
            ))}
          </div>
          <a
            href="#rating"
            className="mt-4 inline-flex items-center gap-2 text-[0.85rem] text-olive underline decoration-bark/25 underline-offset-4 transition-colors hover:text-ink"
          >
            See it on the chart
            <span aria-hidden>↑</span>
          </a>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-4">
          <AddRole />
        </Reveal>
      </div>
    </section>
  );
}
