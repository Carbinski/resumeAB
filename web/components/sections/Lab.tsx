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
  "Reading both résumés",
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
}: {
  baseline: ResumeVersion;
  onDraft: (v: ResumeVersion) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    if (!isSupportedResume(file.name)) {
      setError(`Use ${ACCEPTED_FORMATS.join(", ")}.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onDraft(await uploadResume(file, { baseline, label: "Draft", note: "Draft from the A/B lab." }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
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
        "relative flex min-h-[116px] items-center justify-between gap-4 rounded-[22px] border border-dashed px-5 py-4 transition-colors duration-300",
        over ? "border-clay bg-blush/40" : "border-bark/25 bg-cream/50",
      )}
    >
      <div>
        <p className="text-[0.95rem] text-ink">
          {busy ? "Rating your edit…" : over ? "Release to add as B" : "Drop the edited version"}
        </p>
        <p className="mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-olive">
          {ACCEPTED_FORMATS.map((f) => f.slice(1)).join(" · ")}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-[0.78rem] text-clay">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-full border border-bark/20 px-4 py-2 text-[0.82rem] text-ink transition-colors hover:bg-white/70 disabled:opacity-50"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bark/20 border-t-clay" />
            Rating
          </span>
        ) : (
          "Browse"
        )}
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

export function Lab() {
  const { history, current, role, setRole, addVersion } = useLadder();
  const lenis = useLenis();

  const [aId, setAId] = useState<string | null>(null);
  const [b, setB] = useState<ResumeVersion | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const a = history.find((v) => v.id === aId) ?? current;
  const ready = !!b && b.id !== a.id;

  const reset = () => {
    setPhase("setup");
    setResult(null);
    setSavedAs(null);
  };

  const run = async () => {
    if (!b || !ready) return;
    setPhase("running");
    setSavedAs(null);
    const outcome = await compareVersions(a, b, role);
    setResult(outcome);
    setPhase("result");
    setTimeout(() => {
      if (lenis) lenis.scrollTo("#lab-result", { offset: -96, duration: 1.4 });
      else document.getElementById("lab-result")?.scrollIntoView({ behavior: "smooth" });
    }, 350);
  };

  const keep = () => {
    if (!result) return;
    const label = `v${history.length + 1}`;
    addVersion(result.b);
    setB({ ...result.b, label });
    setSavedAs(label);
  };

  const bIsDraft = !!b && !history.some((v) => v.id === b.id);

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
        Put your current résumé on one side and the edited version on the
        other. Ladder weighs them head to head, in both orders, on six
        qualities.
      </SectionHeader>

      <Reveal className="relative mt-12 overflow-hidden rounded-[36px] border border-bark/10 bg-gradient-to-b from-white/60 to-peach/40 p-5 sm:p-8 md:mt-16 md:p-10">
        <Balance
          a={a}
          b={b}
          role={role}
          phase={phase}
          pB={result ? result.pB : null}
        />

        <div className="mt-10 grid gap-6 md:grid-cols-2 md:gap-8">
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

        <div className="mt-10 flex flex-col items-center gap-5">
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

          <AnimatePresence mode="wait" initial={false}>
            {phase === "running" ? (
              <motion.div
                key="running"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full max-w-md text-center"
              >
                <StepTicker steps={RUN_STEPS} intervalMs={750} className="justify-center text-center" />
                <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-bark/10">
                  <motion.div
                    className="h-full rounded-full bg-clay"
                    initial={{ width: "4%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center gap-2"
              >
                <Magnetic>
                  <Button className="h-12 px-8" disabled={!ready} onClick={run}>
                    {phase === "result" ? "Run it again" : "Run comparison"}
                  </Button>
                </Magnetic>
                {!ready ? (
                  <p className="text-[0.8rem] text-taupe">
                    Add a B version to put on the scale.
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      <div id="lab-result" className="scroll-mt-24">
        <AnimatePresence>
          {phase === "result" && result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="pt-14 md:pt-20"
            >
              <Verdict result={result} />

              <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-12">
                <div className="glass rounded-[32px] p-5 sm:p-8 lg:col-span-8">
                  <Duels result={result} />
                </div>
                <div className="rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8 lg:col-span-4">
                  <PositionCheck result={result} />
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {savedAs ? (
                  <p role="status" className="rounded-full bg-peach px-5 py-3 text-[0.9rem] text-bark">
                    Saved as {savedAs}. It now counts toward your ELO history.
                  </p>
                ) : bIsDraft ? (
                  <Button variant="ink" onClick={keep}>
                    Keep B as v{history.length + 1}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={reset}>
                  Clear result
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
