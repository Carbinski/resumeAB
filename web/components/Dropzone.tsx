"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import { useEffect, useState } from "react";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { formatDelta } from "@/lib/elo";
import { useLadder } from "./LadderProvider";
import { DeltaChip } from "./ui/DeltaChip";

export const PROCESSING_STEPS = [
  "Reading the file",
  "Extracting the text",
  "Running head-to-head matchups",
  "Fitting your rating",
];

/** Cycles through the processing copy while a résumé is being rated. */
export function useProcessingStep(active: boolean, stepMs = 650) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1)),
      stepMs,
    );
    return () => clearInterval(id);
  }, [active, stepMs]);
  return step;
}

export function Dropzone({ dragging }: { dragging: boolean }) {
  const { upload, pickFile, resetUpload } = useLadder();
  const lenis = useLenis();
  const processing = upload.phase === "processing";
  const step = useProcessingStep(processing);

  useEffect(() => {
    if (upload.phase !== "done") return;
    const id = setTimeout(() => {
      if (lenis) lenis.scrollTo("#rating", { offset: -88, duration: 1.6 });
      else document.getElementById("rating")?.scrollIntoView({ behavior: "smooth" });
    }, 2400);
    return () => clearTimeout(id);
  }, [upload, lenis]);

  return (
    <div id="upload" className="mx-auto w-full max-w-[720px]">
      <motion.div
        animate={{ scale: dragging ? 1.025 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className={cn(
          "glass relative overflow-hidden rounded-[28px] border-dashed p-1.5 transition-colors duration-300",
          dragging && "!border-clay bg-white/90",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {upload.phase === "processing" ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="px-5 py-4 sm:px-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[0.72rem] text-olive">
                    {upload.fileName}
                  </p>
                  <div className="relative mt-1 h-6 overflow-hidden text-[1.02rem] text-ink">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.p
                        key={step}
                        className="absolute inset-x-0 top-0"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        {PROCESSING_STEPS[step]}…
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>
                <span className="font-mono text-[0.72rem] text-olive">
                  {step + 1}/{PROCESSING_STEPS.length}
                </span>
              </div>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-bark/10">
                <motion.div
                  className="h-full rounded-full bg-clay"
                  initial={{ width: "4%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.6, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
            </motion.div>
          ) : upload.phase === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
            >
              <div>
                <p className="font-mono text-[0.72rem] text-olive">
                  {upload.version.label} · {upload.version.fileName}
                </p>
                <p className="mt-0.5 flex items-center gap-2.5 text-[1.02rem] text-ink">
                  Rated{" "}
                  <span className="font-display text-[1.6rem] leading-none">
                    {upload.version.ratings.overall}
                  </span>
                  <DeltaChip delta={upload.delta} />
                  <span className="sr-only">{formatDelta(upload.delta)} vs previous version</span>
                </p>
              </div>
              <button
                type="button"
                onClick={resetUpload}
                className="rounded-full px-3 py-1.5 text-[0.82rem] text-olive underline decoration-bark/25 underline-offset-4 hover:text-ink"
              >
                Upload another
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peach text-bark">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 14V4.5M6 8.2l4-3.9 4 3.9" />
                    <path d="M4 14.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" />
                  </svg>
                </span>
                <div>
                  <p className="text-[1.02rem] text-ink">
                    {dragging ? "Release to rate this résumé" : "Drop a new version anywhere on the page"}
                  </p>
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-olive">
                    {ACCEPTED_FORMATS.map((f) => f.slice(1)).join(" · ")}
                  </p>
                </div>
              </div>
              {upload.phase === "error" ? (
                <p role="alert" className="text-[0.82rem] text-clay">
                  {upload.message}
                </p>
              ) : null}
              <button
                type="button"
                onClick={pickFile}
                className="shrink-0 rounded-full border border-bark/20 px-4 py-2 text-[0.85rem] text-ink transition-colors hover:bg-white/70"
              >
                Browse files
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
