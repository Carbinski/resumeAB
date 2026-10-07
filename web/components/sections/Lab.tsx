"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import { useRef, useState } from "react";
import { compareVersions, isSupportedResume, uploadResume } from "@/lib/api";
import { compareSampleVersions } from "@/lib/sampleHistory";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { LABEL_MAX, labelFromFileName } from "@/lib/labels";
import { ROLES } from "@/lib/roles";
import type { CompareResult, ResumeVersion } from "@/lib/types";
import { Balance } from "../Balance";
import { useLadder } from "../LadderProvider";
import { ResumeNameForm } from "../ResumeNameForm";
import { Duels, PositionCheck, Verdict } from "../Results";
import { Button, Magnetic } from "../ui/Button";
import { EASE, Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";
import { Segmented } from "../ui/Segmented";
import { StepTicker } from "../ui/StepTicker";

type Phase = "setup" | "running" | "result";

/** A challenger stays on the scale only while it is still in the history, or it is the unsaved lab draft. */
function visibleChallenger(
  candidate: ResumeVersion | null,
  history: ResumeVersion[],
  draftId: string | null,
  demo: boolean,
): ResumeVersion | null {
  if (!candidate) return null;
  const listed = history.find((version) => version.id === candidate.id);
  if (listed) return listed;
  if (!demo && candidate.id === draftId) return candidate;
  return null;
}

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
  const { demo } = useLadder();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; suggested: string; token: number } | null>(null);

  const stage = (file: File | undefined) => {
    if (!file || busy) return;
    if (demo) {
      setError("Leave sample history before uploading.");
      return;
    }
    if (!isSupportedResume(file.name)) {
      setError(`Use ${ACCEPTED_FORMATS.join(", ")}.`);
      return;
    }
    setError(null);
    setPending((current) => ({
      file,
      suggested: labelFromFileName(file.name),
      token: (current?.token ?? 0) + 1,
    }));
  };

  const confirm = async (label: string) => {
    if (!pending || busy) return;
    const name = label.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    onBusy(true);
    try {
      onDraft(
        await uploadResume(pending.file, {
          baseline,
          label: name.slice(0, LABEL_MAX),
          note: "Draft from the A/B lab.",
          draft: true,
        }),
      );
      setPending(null);
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
        stage(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "rounded-[20px] border border-dashed px-5 transition-colors duration-300",
        pending ? "py-4" : "flex h-[76px] items-center justify-between gap-4",
        over && !pending ? "border-clay bg-blush/40" : "border-bark/25 bg-cream/50",
      )}
    >
      {pending ? (
        <div>
          <ResumeNameForm
            key={pending.token}
            fileName={pending.file.name}
            suggested={pending.suggested}
            submitLabel={busy ? "Adding…" : "Add draft"}
            busy={busy}
            onConfirm={(label) => void confirm(label)}
            onCancel={() => {
              if (!busy) setPending(null);
            }}
          />
          {error ? (
            <p role="alert" className="mt-2 truncate text-[0.74rem] text-clay">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] text-ink">
              {over ? "Release to add as B" : "Drop the edited version"}
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
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-full border border-bark/20 px-4 py-2 text-[0.82rem] text-ink transition-colors hover:bg-white/70"
          >
            Browse
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPTED_FORMATS.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          stage(file);
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
  const { history, current, role, setRole, addVersion, demo } = useLadder();
  const lenis = useLenis();
  const stageRef = useRef<HTMLDivElement>(null);

  const [aId, setAId] = useState<string | null>(null);
  const [b, setB] = useState<ResumeVersion | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!current) {
    return (
      <section id="lab" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pb-24 sm:px-8 md:pb-32">
        <SectionHeader
          index="04"
          label="A/B lab"
          title={
            <>
              Change one thing. <em className="text-clay">See if it worked.</em>
            </>
          }
        >
          Upload two versions and Ladder weighs them head to head, in both orders.
        </SectionHeader>
      </section>
    );
  }

  const a = history.find((v) => v.id === aId) ?? current;
  const challenger = visibleChallenger(b, history, draftId, demo);
  const ready = !!challenger && challenger.id !== a.id && !drafting;
  const bIsDraft = !!challenger && !history.some((v) => v.id === challenger.id);
  const shownResult =
    result &&
    challenger &&
    result.a.id === a.id &&
    result.b.id === challenger.id &&
    result.role === role
      ? result
      : null;
  const shownPhase: Phase = phase === "running" ? "running" : shownResult ? "result" : "setup";
  const displayResult = phase === "running" ? result : shownResult;

  const reset = () => {
    setPhase("setup");
    setResult(null);
    setSavedAs(null);
    setError(null);
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
    if (!challenger || !ready) return;
    setSavedAs(null);
    setError(null);
    frameStage();
    if (demo) {
      setResult(compareSampleVersions(a, challenger, role));
      setPhase("result");
      return;
    }
    setPhase("running");
    try {
      const outcome = await compareVersions(a, challenger, role);
      setResult(outcome);
      setPhase("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not compare those versions.");
      setPhase("setup");
    }
  };

  const keep = async () => {
    if (!result) return;
    const published = await addVersion(result.b);
    if (!published) return;
    setDraftId(null);
    setB(published);
    setSavedAs(published.label);
  };

  const backToStage = () => {
    frameStage();
    reset();
  };

  const hint = drafting
    ? "Rating your edit…"
    : !challenger
      ? demo
        ? "Sample history. Choose two versions. The comparison stays on this page."
        : "Choose a baseline, then add the version you changed."
      : challenger.id === a.id
        ? "Pick two different versions to compare."
        : demo
          ? "Ready. This uses the saved scores, not a live rating."
          : "Ready. Weigh A against B.";

  return (
    <section id="lab" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pb-24 sm:px-8 md:pb-32">
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
                  setDraftId(v.id);
                  setB(v);
                  reset();
                }}
              />
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-[0.78rem] text-taupe">or</span>
                <VersionChips
                  label="Challenger version"
                  versions={history.filter((v) => v.id !== a.id)}
                  selectedId={challenger?.id}
                  onSelect={(v) => {
                    setDraftId(null);
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
            b={challenger}
            role={role}
            phase={shownPhase}
            pB={displayResult ? displayResult.pB : null}
            eloA={displayResult ? displayResult.eloA : null}
            eloB={displayResult ? displayResult.eloB : null}
            pendingB={drafting}
          />

          <div className="mt-2 grid min-h-[15rem] sm:min-h-[12.75rem]">
            <Slot active={shownPhase === "setup"}>
              <p className="max-w-sm text-center text-[1.05rem] leading-snug text-olive">
                {error ?? hint}
              </p>
            </Slot>
            <Slot active={shownPhase === "running"}>
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
            <Slot active={shownPhase === "result"}>
              {displayResult ? (
                <Verdict
                  key={`${displayResult.a.id}-${displayResult.b.id}-${displayResult.role}`}
                  result={displayResult}
                />
              ) : null}
            </Slot>
          </div>

          <div className="mt-4 flex flex-col items-center gap-5">
            <Magnetic>
              <Button className="h-12 min-w-[12rem] px-8" disabled={!ready || shownPhase === "running"} onClick={run}>
                {shownPhase === "running" ? "Weighing…" : shownPhase === "result" ? "Run it again" : "Run comparison"}
              </Button>
            </Magnetic>
            {demo ? (
              <p className="max-w-md text-center text-[0.85rem] leading-snug text-olive">
                Sample history. Scored from the Elo gap on this page, not a live rating.
              </p>
            ) : null}
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

      {shownPhase === "result" && displayResult ? (
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
        {shownPhase === "result" && displayResult ? (
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
                <Duels result={displayResult} />
              </div>
              <div className="rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8 lg:col-span-4">
                <PositionCheck result={displayResult} />
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 pb-1">
              {savedAs ? (
                <p role="status" className="rounded-full bg-peach px-5 py-3 text-[0.9rem] text-bark">
                  Saved as {savedAs}. It now counts toward your ELO history.
                </p>
              ) : challenger && bIsDraft ? (
                <Button variant="ink" onClick={() => void keep()} className="max-w-full">
                  <span className="max-w-[18rem] truncate">Keep {challenger.label}</span>
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
