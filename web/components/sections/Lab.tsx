"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import { useRef, useState } from "react";
import { compareVersions, isSupportedResume, uploadResume } from "@/lib/api";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { ROLES } from "@/lib/roles";
import type { CompareResult, ResumeVersion } from "@/lib/types";
import { Balance } from "../Balance";
import { useLadder } from "../LadderProvider";
import { Duels, PositionCheck, Verdict } from "../Results";
import { Button, Magnetic } from "../ui/Button";
import { EASE, Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";
import { Segmented } from "../ui/Segmented";
import { StepTicker } from "../ui/StepTicker";

type Phase = "setup" | "running" | "result";

const RUN_STEPS = [
  "Reading both resumes",
  "A on the left, B on the right",
  "Swapping sides to check for bias",
  "Weighing six qualities",
];

function VersionChips({
  versions,
  selectedId,
  onSelect,
  label,
}: {
  versions: ResumeVersion[];
  selectedId?: string;
  onSelect: (v: ResumeVersion) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {[...versions].reverse().map((v) => {
        const selected = v.id === selectedId;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(v)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[0.74rem] transition-colors duration-300",
              selected
                ? "border-ink bg-ink text-cream"
                : "border-bark/20 bg-cream/50 text-olive hover:border-bark/40 hover:text-ink",
            )}
          >
            {v.label}
            <span className={cn("ml-2", selected ? "text-rose" : "text-taupe")}>
              {v.ratings.overall}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DraftDrop({
  baseline,
  onDraft,
  onBusy,
}: {
  baseline: ResumeVersion;
  onDraft: (v: ResumeVersion) => void;
  onBusy: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!isSupportedResume(file.name)) {
      setError(`Use ${ACCEPTED_FORMATS.join(", ")}.`);
      return;
    }
    setError(null);
    setBusy(true);
    onBusy(true);
    try {
      onDraft(await uploadResume(file, { baseline, label: "Draft", note: "Draft from the A/B lab." }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <div
      data-local-drop
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex h-[76px] items-center justify-between gap-4 rounded-[20px] border border-dashed px-5 transition-colors duration-300",
        over ? "border-clay bg-blush/40" : "border-bark/25 bg-cream/50",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[0.95rem] text-ink">
          {busy ? "Rating your edit…" : over ? "Release to add as B" : "Drop the edited version"}
        </p>
        {error ? (
          <p role="alert" className="truncate text-[0.74rem] text-clay">
            {error}
          </p>
        ) : (
          <p className="truncate font-mono text-[0.66rem] uppercase tracking-[0.14em] text-olive">
            {ACCEPTED_FORMATS.map((f) => f.slice(1)).join(" · ")}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-full border border-bark/20 px-4 py-2 text-[0.82rem] text-ink transition-colors hover:bg-white/70 disabled:opacity-50"
      >
        Browse
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPTED_FORMATS.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void handle(file);
        }}
      />
    </div>
  );
}

/** Keeps one slot of the status area mounted so the layout never changes height. */
function Slot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="col-start-1 row-start-1 flex flex-col items-center justify-center"
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 10 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{ pointerEvents: active ? "auto" : "none" }}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </motion.div>
  );
}

export function Lab() {
  const { history, current, role, setRole, addVersion } = useLadder();
  const lenis = useLenis();
  const stageRef = useRef<HTMLDivElement>(null);

  const [aId, setAId] = useState<string | null>(null);
  const [b, setB] = useState<ResumeVersion | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const a = history.find((v) => v.id === aId) ?? current;
  const ready = !!b && b.id !== a.id && !drafting;
  const bIsDraft = !!b && !history.some((v) => v.id === b.id);

  const reset = () => {
    setPhase("setup");
    setResult(null);
    setSavedAs(null);
  };

  /** Brings the scale and its verdict into view, only if they are not already. */
  const frameStage = () => {
    const node = stageRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const top = 104;
    if (rect.top >= top - 8 && rect.bottom <= window.innerHeight - 8) return;
    const y = rect.top + window.scrollY - top;
    if (lenis) lenis.scrollTo(y, { duration: 0.9 });
    else window.scrollTo({ top: y, behavior: "smooth" });
  };

  const run = async () => {
    if (!b || !ready) return;
    setPhase("running");
    setSavedAs(null);
    frameStage();
    const outcome = await compareVersions(a, b, role);
    setResult(outcome);
    setPhase("result");
  };

  const keep = () => {
    if (!result) return;
    const label = `v${history.length + 1}`;
    addVersion(result.b);
    setB({ ...result.b, label });
    setSavedAs(label);
  };

  const backToStage = () => {
    frameStage();
    reset();
  };

  const hint = drafting
    ? "Rating your edit…"
    : !b
      ? "Choose a baseline, then add the version you changed."
      : b.id === a.id
        ? "Pick two different versions to compare."
        : "Ready. Weigh A against B.";

  return (
    <section id="lab" className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8 md:pb-32">
      <SectionHeader
        index="04"
        label="A/B lab"
        title={
          <>
            Change one thing. <em className="text-clay">See if it worked.</em>
          </>
        }
      >
        Put your current resume on one side and the edited version on the
        other. Ladder weighs them head to head, in both orders, on six
        qualities.
      </SectionHeader>

      <Reveal className="relative mt-12 overflow-hidden rounded-[36px] border border-bark/10 bg-gradient-to-b from-white/60 to-peach/40 p-5 sm:p-8 md:mt-16 md:p-10">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div>
            <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
              A · Baseline
            </p>
            <VersionChips
              label="Baseline version"
              versions={history}
              selectedId={a.id}
              onSelect={(v) => {
                setAId(v.id);
                reset();
              }}
            />
          </div>
          <div>
            <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
              B · Challenger
            </p>
            <div className="space-y-3">
              <DraftDrop
                baseline={a}
                onBusy={setDrafting}
                onDraft={(v) => {
                  setB(v);
                  reset();
                }}
              />
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-[0.78rem] text-taupe">or</span>
                <VersionChips
                  label="Challenger version"
                  versions={history.filter((v) => v.id !== a.id)}
                  selectedId={b?.id}
                  onSelect={(v) => {
                    setB(v);
                    reset();
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div ref={stageRef} className="mt-8 md:mt-10">
          <Balance
            a={a}
            b={b}
            role={role}
            phase={phase}
            pB={result ? result.pB : null}
            pendingB={drafting}
          />

          <div className="mt-2 grid min-h-[15rem] sm:min-h-[12.75rem]">
            <Slot active={phase === "setup"}>
              <p className="max-w-sm text-center text-[1.05rem] leading-snug text-olive">
                {hint}
              </p>
            </Slot>
            <Slot active={phase === "running"}>
              <div className="w-full max-w-md">
                <StepTicker steps={RUN_STEPS} intervalMs={750} className="justify-center text-center" />
                <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-bark/10">
                  <motion.div
                    className="h-full rounded-full bg-clay"
                    initial={{ width: "4%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </div>
            </Slot>
            <Slot active={phase === "result"}>
              {result ? <Verdict key={`${result.a.id}-${result.b.id}-${result.role}`} result={result} /> : null}
            </Slot>
          </div>

          <div className="mt-4 flex flex-col items-center gap-5">
            <Magnetic>
              <Button className="h-12 min-w-[12rem] px-8" disabled={!ready || phase === "running"} onClick={run}>
                {phase === "running" ? "Weighing…" : phase === "result" ? "Run it again" : "Run comparison"}
              </Button>
            </Magnetic>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-[0.85rem] text-olive">Judge for</span>
              <Segmented
                label="Role to judge for"
                size="sm"
                options={ROLES.map((r) => ({ id: r.id, label: r.label }))}
                value={role}
                onChange={(r) => {
                  setRole(r);
                  reset();
                }}
              />
            </div>
          </div>
        </div>
      </Reveal>

      {phase === "result" && result ? (
        <div className="mt-5 flex justify-center">
          <a
            href="#lab-result"
            className="text-[0.85rem] text-olive underline decoration-bark/25 underline-offset-4 transition-colors hover:text-ink"
          >
            See the quality-by-quality breakdown ↓
          </a>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {phase === "result" && result ? (
          <motion.div
            key="details"
            id="lab-result"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 pt-6 lg:grid-cols-12">
              <div className="glass rounded-[32px] p-5 sm:p-8 lg:col-span-8">
                <Duels result={result} />
              </div>
              <div className="rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8 lg:col-span-4">
                <PositionCheck result={result} />
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 pb-1">
              {savedAs ? (
                <p role="status" className="rounded-full bg-peach px-5 py-3 text-[0.9rem] text-bark">
                  Saved as {savedAs}. It now counts toward your ELO history.
                </p>
              ) : bIsDraft ? (
                <Button variant="ink" onClick={keep}>
                  Keep B as v{history.length + 1}
                </Button>
              ) : null}
              <Button variant="outline" onClick={backToStage}>
                Compare something else
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </section>
  );
}
