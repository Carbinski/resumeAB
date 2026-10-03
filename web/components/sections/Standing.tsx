"use client";

import { levelLabel } from "@/lib/cohort";
import type { ResumeVersion } from "@/lib/types";

const RELATION = {
  same: "Same band",
  above: "One band above",
  below: "One band below",
} as const;

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function Standing({ version }: { version: ResumeVersion }) {
  const { standing } = version;
  const level = levelLabel(version.level);
  const peak = Math.max(1, ...standing.histogram.map((band) => band.count));
  const percentile =
    standing.percentile == null ? null : Math.round(standing.percentile * 100);

  return (
    <div className="mt-5 rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
            Around you
          </p>
          <h3 className="font-display mt-2 text-[1.8rem] leading-none text-ink">{standing.band}</h3>
        </div>
        <p className="max-w-sm text-[0.88rem] leading-snug text-olive">
          {standing.status === "placing"
            ? `Placing this résumé · ${standing.matchesPlayed} of ${standing.matchBudget} matchups.`
            : percentile == null
              ? "You're the first placed résumé in this pool."
              : `About the ${ordinal(percentile)} percentile of ${level.toLowerCase()} résumés.`}
          {standing.status === "provisional"
            ? " Provisional — a few matchups are still running."
            : ""}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-2">
        {standing.histogram.map((band) => {
          const active = band.label === standing.band;
          return (
            <div key={band.label} className="text-center">
              <div className="flex h-16 items-end">
                <div
                  className={`w-full rounded-t-xl ${active ? "bg-clay" : "bg-bark/15"}`}
                  style={{ height: `${Math.max(8, (band.count / peak) * 100)}%` }}
                />
              </div>
              <p className={`mt-2 font-mono text-[0.66rem] ${active ? "text-ink" : "text-taupe"}`}>
                {band.count}
              </p>
              <p className="mt-1 text-[0.68rem] leading-tight text-olive">{band.label}</p>
            </div>
          );
        })}
      </div>

      {standing.widened ? (
        <p className="mt-5 text-[0.86rem] text-olive">
          Few people in your industry yet. Showing other {version.level === "intern" ? "interns" : "new grads"}.
        </p>
      ) : null}

      {standing.neighbors.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {standing.neighbors.map((card, index) => (
            <li key={`${card.company ?? "anon"}-${card.relation}-${index}`} className="rounded-2xl bg-cream/70 px-4 py-3">
              <p className="text-[0.95rem] text-ink">{card.company ?? "Company not listed"}</p>
              <p className="mt-1 text-[0.8rem] text-olive">
                {card.levelLabel} · {card.industryLabel}
              </p>
              <p className="mt-1 font-mono text-[0.72rem] text-taupe">{RELATION[card.relation]}</p>
            </li>
          ))}
        </ul>
      ) : standing.status !== "placing" ? (
        <p className="mt-5 text-[0.86rem] text-olive">No other résumés in the neighboring bands yet.</p>
      ) : null}

      {standing.status === "error" && standing.message ? (
        <p role="alert" className="mt-4 text-[0.86rem] text-clay">
          {standing.message}
        </p>
      ) : null}
    </div>
  );
}
