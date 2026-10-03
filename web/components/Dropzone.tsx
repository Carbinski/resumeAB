"use client";

import { motion } from "motion/react";
import { useLenis } from "lenis/react";
import type { ReactNode } from "react";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { formatDelta } from "@/lib/elo";
import { useLadder } from "./LadderProvider";
import { DeltaChip } from "./ui/DeltaChip";
import { StepTicker } from "./ui/StepTicker";

export const PROCESSING_STEPS = [
  "Reading the file",
  "Extracting the text",
  "Running head-to-head matchups",
  "Fitting your rating",
];

/**
 * All states share one grid cell, so the dropzone is as tall as its tallest
 * state from the first paint and never pushes the page around.
 */
function Slot({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="col-start-1 row-start-1 flex flex-col justify-center px-5 py-4 sm:px-6"
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }}
      transition={{ duration: 0.4 }}
      style={{ pointerEvents: active ? "auto" : "none" }}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </motion.div>
  );
}

export function Dropzone({ dragging }: { dragging: boolean }) {
  const { upload, pickFile, resetUpload } = useLadder();
  const lenis = useLenis();

  const viewRating = () => {
    if (lenis) lenis.scrollTo("#rating", { offset: -88, duration: 1.4 });
    else document.getElementById("rating")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div id="upload" className="mx-auto w-full max-w-[720px]">
      <motion.div
        animate={{ scale: dragging ? 1.025 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className={cn(
          "glass relative grid min-h-[132px] overflow-hidden rounded-[28px] border-dashed p-1.5 transition-colors duration-300 sm:min-h-[96px]",
          dragging && "!border-clay bg-white/90",
        )}
      >
        <Slot active={upload.phase === "idle" || upload.phase === "error"}>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                {upload.phase === "error" ? (
                  <p role="alert" className="font-mono text-[0.72rem] text-clay">
                    {upload.message}
                  </p>
                ) : (
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-olive">
                    {ACCEPTED_FORMATS.map((f) => f.slice(1)).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={pickFile}
              className="shrink-0 rounded-full border border-bark/20 px-4 py-2 text-[0.85rem] text-ink transition-colors hover:bg-white/70"
            >
              Browse files
            </button>
          </div>
        </Slot>

        <Slot active={upload.phase === "processing"}>
          <p className="truncate font-mono text-[0.72rem] text-olive">
            {upload.phase === "processing" ? upload.fileName : "\u00a0"}
          </p>
          {upload.phase === "processing" ? (
            <StepTicker steps={PROCESSING_STEPS} intervalMs={650} showCount className="mt-1" />
          ) : (
            <div className="mt-1 h-7" />
          )}
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-bark/10">
            {upload.phase === "processing" ? (
              <motion.div
                className="h-full rounded-full bg-clay"
                initial={{ width: "4%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2.6, ease: [0.4, 0, 0.2, 1] }}
              />
            ) : null}
          </div>
        </Slot>

        <Slot active={upload.phase === "done"}>
          {upload.phase === "done" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={resetUpload}
                  className="rounded-full px-3 py-1.5 text-[0.82rem] text-olive underline decoration-bark/25 underline-offset-4 hover:text-ink"
                >
                  Upload another
                </button>
                <button
                  type="button"
                  onClick={viewRating}
                  className="rounded-full bg-ink px-4 py-2 text-[0.82rem] text-cream transition-colors hover:bg-bark"
                >
                  View your rating ↓
                </button>
              </div>
            </div>
          ) : null}
        </Slot>
      </motion.div>
    </div>
  );
}
