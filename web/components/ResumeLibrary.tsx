"use client";

import { useState } from "react";
import { formatDate } from "@/lib/ratings";
import type { ResumeVersion } from "@/lib/types";

export function ResumeLibrary({
  versions,
  onRemove,
}: {
  versions: ResumeVersion[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (versions.length === 0) return null;

  const remove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onRemove(id);
      setConfirmId((current) => (current === id ? null : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that resume.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-8 rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-8">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
        Your resumes
      </p>
      <h3 className="font-display mt-2 text-[2rem] leading-none text-ink">Earlier uploads</h3>
      <p className="mt-3 max-w-xl text-[0.9rem] leading-relaxed text-olive">
        Each name is the one you gave at upload. Removing one deletes that file and its text.
        Matchups already played stay on the ladder.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-[0.86rem] text-clay">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 divide-y divide-bark/10">
        {[...versions].reverse().map((version) => {
          const confirming = confirmId === version.id;
          const busy = busyId === version.id;
          return (
            <li
              key={version.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-[1.05rem] text-ink">{version.label}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.72rem] text-olive">
                  <span className="max-w-full truncate">{version.fileName}</span>
                  <span>{formatDate(version.uploadedAt, "long")}</span>
                  <span>Elo {version.ratings.overall}</span>
                </p>
              </div>
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.85rem] text-olive">Remove {version.label}?</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(version.id)}
                    className="rounded-full bg-ink px-4 py-2 text-[0.82rem] text-cream transition-colors hover:bg-bark disabled:opacity-50"
                  >
                    {busy ? "Removing…" : "Remove"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmId(null)}
                    className="rounded-full px-3 py-2 text-[0.82rem] text-olive underline decoration-bark/25 underline-offset-4 hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfirmId(version.id);
                  }}
                  className="self-start rounded-full border border-bark/20 px-4 py-2 text-[0.82rem] text-ink transition-colors hover:bg-white/70"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
