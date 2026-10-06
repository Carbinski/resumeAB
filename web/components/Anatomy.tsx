"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { CATEGORIES } from "@/lib/categories";
import { formatDelta } from "@/lib/elo";
import { categoryElo } from "@/lib/ratings";
import type { RoleId } from "@/lib/roles";
import type { ResumeVersion } from "@/lib/types";
import { CategoryGlyph } from "./ui/CategoryGlyph";
import { EASE } from "./ui/Reveal";

const SCALE_MIN = 820;
const SCALE_MAX = 1320;

/** The six category scores behind the headline rating for one version. */
export function Anatomy({
  version,
  before,
  role,
}: {
  version: ResumeVersion;
  before?: ResumeVersion;
  role: RoleId;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  const rows = CATEGORIES.map((def) => {
    const value = categoryElo(version, def.id, role);
    const prior = before ? categoryElo(before, def.id, role) : null;
    return {
      def,
      value,
      delta: value == null || prior == null ? null : value - prior,
    };
  });
  const scored = rows.filter((row): row is typeof row & { value: number } => row.value != null);
  if (scored.length === 0) {
    return (
      <div>
        <h3 className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
          Anatomy of {version.label}
        </h3>
        <p className="mt-4 text-[0.9rem] leading-relaxed text-olive">
          Quality scores show up with your second version. That comparison asks the six
          questions alongside the head-to-head.
        </p>
      </div>
    );
  }
  const strongest = scored.reduce((a, b) => (b.value > a.value ? b : a));
  const weakest = scored.reduce((a, b) => (b.value < a.value ? b : a));

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
          Anatomy of {version.label}
        </h3>
        <span className="font-mono text-[0.7rem] text-taupe">ELO by quality</span>
      </div>

      <ul className="mt-5 space-y-4">
        {scored.map(({ def, value, delta }, i) => (
          <li key={def.id}>
            <div className="flex items-center justify-between gap-3 text-[0.88rem]">
              <span className="flex items-center gap-2 text-ink">
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-cream"
                  style={{ background: def.color }}
                >
                  <CategoryGlyph id={def.id} className="h-3.5 w-3.5" />
                </span>
                {def.label}
              </span>
              <span className="flex items-baseline gap-2 font-mono text-[0.78rem]">
                {delta != null ? (
                  <span className={delta >= 0 ? "text-olive" : "text-clay"}>
                    {formatDelta(delta)}
                  </span>
                ) : null}
                <span className="text-ink">{value ?? "—"}</span>
              </span>
            </div>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-bark/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: def.color }}
                initial={{ width: 0 }}
                animate={{
                  width: inView
                    ? `${Math.max(4, (((value ?? SCALE_MIN) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100)}%`
                    : 0,
                }}
                transition={{ duration: 1.1, ease: EASE, delay: inView ? i * 0.07 : 0 }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[0.84rem] leading-relaxed text-olive">
        <span className="text-ink">{strongest.def.label}</span> is carrying this version.{" "}
        <span className="text-ink">{weakest.def.label}</span> has the most room to grow.
      </p>
    </div>
  );
}
