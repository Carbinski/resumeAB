"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { industryLabel, levelLabel } from "@/lib/cohort";
import { placedRoleScore } from "@/lib/ratings";
import { ROLE_BY_ID, visibleRoleIds } from "@/lib/roles";
import { Anatomy } from "../Anatomy";
import { EloChart } from "../EloChart";
import { ResumeLibrary } from "../ResumeLibrary";
import { useLadder } from "../LadderProvider";
import { Standing } from "./Standing";
import { Button } from "../ui/Button";
import { DeltaChip } from "../ui/DeltaChip";
import { Odometer } from "../ui/Odometer";
import { Reveal } from "../ui/Reveal";
import { Segmented } from "../ui/Segmented";
import { SectionHeader } from "../ui/SectionHeader";

type Range = "2M" | "4M" | "all";
const RANGE_MONTHS: Record<Exclude<Range, "all">, number> = { "2M": 2, "4M": 4 };
const RANGES = [
  { id: "2M", label: "2M" },
  { id: "4M", label: "4M" },
  { id: "all", label: "All" },
] as const;

export function Rating() {
  const { history, role, setRole, rateForRole, roleRun, removeVersion, demo, exitDemo, user } =
    useLadder();
  const roleOptions = visibleRoleIds(demo, user?.focus).map((id) => ({
    id,
    label: ROLE_BY_ID[id].label,
  }));
  const [range, setRange] = useState<Range>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const versions = useMemo(() => {
    if (history.length === 0) return [];
    if (range === "all") return history;
    const last = new Date(history[history.length - 1].uploadedAt);
    const cutoff = new Date(last);
    cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range]);
    const inRange = history.filter((v) => new Date(v.uploadedAt) >= cutoff);
    return inRange.length >= 2 ? inRange : history.slice(-2);
  }, [history, range]);

  const chartVersions = versions.filter((version) => placedRoleScore(version, role) != null);
  if (history.length === 0) {
    return (
      <section id="rating" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
        <SectionHeader
          index="02"
          label="Your rating"
          title={
            <>
              Your ELO, <em className="text-clay">over time.</em>
            </>
          }
        >
          Upload a resume and it is rated against other interns or new grads, eight
          matchups at a time.
        </SectionHeader>
      </section>
    );
  }

  const active = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1];
  const poolLevel = active.level === "newgrad" ? "new-grad" : "intern";
  const index = history.findIndex((v) => v.id === active.id);
  const before = index > 0 ? history[index - 1] : undefined;
  const overallDelta = before ? active.ratings.overall - before.ratings.overall : 0;
  const first = history[0];
  const totalGain = active.ratings.overall - first.ratings.overall;

  return (
    <section id="rating" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
      <SectionHeader
        index="02"
        label="Your rating"
        title={
          <>
            {levelLabel(active.level)} · <em className="text-clay">{industryLabel(active.industry)}</em>
          </>
        }
      >
        This score is the {poolLevel} ladder, shared across industries. Slide
        across the line to see what changed, and what it did to your score.
      </SectionHeader>

      {demo ? (
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p role="status" className="text-[0.85rem] text-olive">
            Sample history
          </p>
          <button
            type="button"
            onClick={exitDemo}
            className="text-[0.85rem] text-ink underline decoration-bark/25 underline-offset-4"
          >
            Leave sample history
          </button>
        </div>
      ) : null}

      <div className="mt-12 grid gap-5 md:mt-16 lg:grid-cols-12">
        <Reveal className="glass rounded-[32px] p-5 sm:p-8 lg:col-span-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
                Overall ELO · {active.label}
              </p>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
                <Odometer
                  value={active.ratings.overall}
                  className="font-display text-[clamp(4rem,9vw,6.4rem)] leading-none text-ink"
                />
                <div className="mb-2 flex items-center gap-2">
                  <DeltaChip delta={overallDelta} suffix={before ? `vs ${before.label}` : undefined} />
                </div>
              </div>
              <AnimatePresence initial={false} mode="wait">
                {role !== "overall" ? (
                  <motion.p
                    key={role}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-2 flex items-center gap-2 text-[0.9rem] text-olive"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-clay" />
                    {ROLE_BY_ID[role].label}:{" "}
                    <span className="font-mono text-ink">{placedRoleScore(active, role) ?? "—"}</span>
                  </motion.p>
                ) : (
                  <motion.p
                    key="all"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-2 text-[0.9rem] text-olive"
                  >
                    {totalGain >= 0 ? "Up" : "Down"}{" "}
                    <span className="font-mono text-ink">{Math.abs(totalGain)}</span> since your first upload.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <Segmented
              label="Time range"
              size="sm"
              options={RANGES}
              value={range}
              onChange={(r) => {
                setRange(r);
                setActiveId(null);
              }}
            />
          </div>

          <div className="mt-6">
            <Segmented
              label="Role"
              options={roleOptions}
              value={role}
              onChange={setRole}
            />
          </div>

          <div className="mt-6 -mx-1">
            {chartVersions.length > 0 ? (
              <EloChart
                key={range}
                versions={chartVersions}
                history={history}
                role={role}
                activeId={chartVersions.some((version) => version.id === active.id) ? active.id : chartVersions[chartVersions.length - 1].id}
                onActive={setActiveId}
              />
            ) : (
              <div className="rounded-3xl border border-dashed border-bark/20 px-5 py-8">
                <p className="text-[0.95rem] text-olive">
                  {ROLE_BY_ID[role].label} has not been rated yet.
                  {demo
                    ? " Sample history leaves it that way."
                    : " It uses the same eight-matchup budget, only when you ask for it."}
                </p>
                {demo ? null : (
                  <Button
                    className="mt-4"
                    disabled={roleRun != null || role === "overall"}
                    onClick={() => {
                      if (role !== "overall") void rateForRole(role);
                    }}
                  >
                    {roleRun === role ? "Rating…" : `Rate latest for ${ROLE_BY_ID[role].label}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8 lg:col-span-4">
          <Anatomy version={active} before={before} role={role} />
        </Reveal>
      </div>
      {demo ? null : (
        <ResumeLibrary
          versions={history}
          onRemove={async (id) => {
            await removeVersion(id);
            setActiveId((current) => (current === id ? null : current));
          }}
        />
      )}
      <Standing version={active} />
    </section>
  );
}
