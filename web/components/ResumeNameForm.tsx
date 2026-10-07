"use client";

import { useId, useState } from "react";
import { LABEL_MAX } from "@/lib/labels";

export function ResumeNameForm({
  fileName,
  suggested,
  submitLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  suggested: string;
  submitLabel: string;
  busy?: boolean;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}) {
  const fileId = useId();
  const [name, setName] = useState(suggested);
  const trimmed = name.trim();

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || busy) return;
        onConfirm(trimmed.slice(0, LABEL_MAX));
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5 text-left">
          <span className="text-[0.72rem] font-medium uppercase tracking-[0.14em] text-olive">
            Name this resume
          </span>
          <input
            value={name}
            maxLength={LABEL_MAX}
            autoFocus
            required
            aria-describedby={fileId}
            onChange={(event) => setName(event.target.value.slice(0, LABEL_MAX))}
            className="w-full rounded-2xl border border-bark/15 bg-cream/80 px-4 py-2.5 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-taupe focus:border-clay"
            placeholder="Summer internship"
          />
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="submit"
            disabled={!trimmed || busy}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-[0.85rem] text-cream transition-colors hover:bg-bark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-3 py-2.5 text-[0.85rem] text-olive underline decoration-bark/25 underline-offset-4 hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
      <p id={fileId} className="truncate text-left font-mono text-[0.72rem] text-olive">
        {fileName}
      </p>
    </form>
  );
}
