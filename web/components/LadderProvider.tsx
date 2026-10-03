"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uploadResume } from "@/lib/api";
import type { RoleId } from "@/lib/roles";
import type { ResumeVersion } from "@/lib/types";

export type UploadStatus =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "done"; version: ResumeVersion; delta: number }
  | { phase: "error"; message: string };

interface LadderState {
  history: ResumeVersion[];
  current: ResumeVersion;
  role: RoleId;
  setRole: (role: RoleId) => void;
  upload: UploadStatus;
  /** Rates a file and appends it to the history. */
  rateFile: (file: File) => Promise<ResumeVersion | null>;
  /** Appends an already-rated version, e.g. an A/B draft the user keeps. */
  addVersion: (version: ResumeVersion) => void;
  resetUpload: () => void;
}

const Ctx = createContext<LadderState | null>(null);

export function useLadder(): LadderState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useLadder must be used inside <LadderProvider>");
  return value;
}

export function LadderProvider({
  initialHistory,
  children,
}: {
  initialHistory: ResumeVersion[];
  children: ReactNode;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [role, setRole] = useState<RoleId>("overall");
  const [upload, setUpload] = useState<UploadStatus>({ phase: "idle" });

  const current = history[history.length - 1];

  const rateFile = useCallback(
    async (file: File) => {
      setUpload({ phase: "processing", fileName: file.name });
      try {
        const version = await uploadResume(file, {
          baseline: current,
          label: `v${history.length + 1}`,
        });
        setHistory((h) => [...h, version]);
        setUpload({
          phase: "done",
          version,
          delta: version.ratings.overall - current.ratings.overall,
        });
        return version;
      } catch (error) {
        setUpload({
          phase: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
        return null;
      }
    },
    [current, history.length],
  );

  const addVersion = useCallback((version: ResumeVersion) => {
    setHistory((h) =>
      h.some((v) => v.id === version.id)
        ? h
        : [...h, { ...version, label: `v${h.length + 1}` }],
    );
  }, []);

  const resetUpload = useCallback(() => setUpload({ phase: "idle" }), []);

  const value = useMemo(
    () => ({ history, current, role, setRole, upload, rateFile, addVersion, resetUpload }),
    [history, current, role, upload, rateFile, addVersion, resetUpload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
