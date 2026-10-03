"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getHistory, publishVersion, rateRole, uploadResume } from "@/lib/api";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import type { RoleId } from "@/lib/roles";
import type { Account, ResumeVersion } from "@/lib/types";

export type UploadStatus =
  | { phase: "idle" }
  | { phase: "processing"; fileName: string }
  | { phase: "done"; version: ResumeVersion; delta: number }
  | { phase: "error"; message: string };

interface LadderState {
  history: ResumeVersion[];
  current: ResumeVersion | null;
  user: Account | null;
  offline: boolean;
  role: RoleId;
  setRole: (role: RoleId) => void;
  setUser: (user: Account | null) => void;
  upload: UploadStatus;
  /** Rates a file and appends it to the history. */
  rateFile: (file: File) => Promise<ResumeVersion | null>;
  /** Publishes a lab draft onto the ladder. */
  addVersion: (version: ResumeVersion) => Promise<ResumeVersion | null>;
  resetUpload: () => void;
  /** Opens the shared file dialog; the chosen file is rated and added to the history. */
  pickFile: () => void;
  refresh: () => Promise<void>;
  rateForRole: (role: Exclude<RoleId, "overall">) => Promise<void>;
  roleRun: RoleId | null;
  signOut: () => void;
}

const Ctx = createContext<LadderState | null>(null);

export function useLadder(): LadderState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useLadder must be used inside <LadderProvider>");
  return value;
}

function needsPoll(version: ResumeVersion): boolean {
  if (version.standing.status === "placing" || version.standing.status === "provisional") return true;
  return Object.values(version.roleStatus).some(
    (run) => run?.status === "placing" || run?.status === "provisional",
  );
}

export function LadderProvider({
  initialHistory,
  initialUser,
  offline,
  children,
}: {
  initialHistory: ResumeVersion[];
  initialUser: Account | null;
  offline: boolean;
  children: ReactNode;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [user, setUser] = useState(initialUser);
  const [role, setRole] = useState<RoleId>("overall");
  const [upload, setUpload] = useState<UploadStatus>({ phase: "idle" });
  const [roleRun, setRoleRun] = useState<RoleId | null>(null);

  const current = history.length > 0 ? history[history.length - 1] : null;

  const refresh = useCallback(async () => {
    const next = await getHistory();
    setHistory(next);
    setUpload((state) => {
      if (state.phase !== "done" && state.phase !== "processing") return state;
      return state;
    });
  }, []);

  useEffect(() => {
    if (!history.some(needsPoll)) return;
    const timer = setInterval(() => {
      void getHistory()
        .then((next) => {
          setHistory(next);
          setUpload((state) => {
            if (state.phase !== "done") return state;
            const updated = next.find((version) => version.id === state.version.id);
            if (!updated) return state;
            const previous = next[next.findIndex((version) => version.id === updated.id) - 1];
            return {
              phase: "done",
              version: updated,
              delta: previous ? updated.ratings.overall - previous.ratings.overall : state.delta,
            };
          });
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [history]);

  const requireAccount = useCallback(() => {
    if (user) return true;
    setUpload({ phase: "error", message: "Create an account before uploading." });
    document.getElementById("account")?.scrollIntoView({ behavior: "smooth" });
    return false;
  }, [user]);

  const rateFile = useCallback(
    async (file: File) => {
      if (!requireAccount()) return null;
      setUpload({ phase: "processing", fileName: file.name });
      const baseline = current;
      try {
        const version = await uploadResume(file, {
          baseline: baseline ?? undefined,
          label: `v${history.length + 1}`,
        });
        setHistory((items) =>
          items.some((item) => item.id === version.id) ? items : [...items, version],
        );
        setUpload({
          phase: "done",
          version,
          delta: baseline ? version.ratings.overall - baseline.ratings.overall : 0,
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
    [current, history.length, requireAccount],
  );

  const addVersion = useCallback(async (version: ResumeVersion) => {
    try {
      const published = await publishVersion(version.id);
      setHistory((items) =>
        items.some((item) => item.id === published.id)
          ? items.map((item) => (item.id === published.id ? published : item))
          : [...items, published],
      );
      return published;
    } catch (error) {
      setUpload({
        phase: "error",
        message: error instanceof Error ? error.message : "Could not keep that version.",
      });
      return null;
    }
  }, []);

  const rateForRole = useCallback(
    async (nextRole: Exclude<RoleId, "overall">) => {
      const latest = current;
      if (!latest) return;
      setRoleRun(nextRole);
      try {
        const version = await rateRole(latest.id, nextRole);
        setHistory((items) => items.map((item) => (item.id === version.id ? version : item)));
      } catch (error) {
        setUpload({
          phase: "error",
          message: error instanceof Error ? error.message : "Could not rate this role.",
        });
      } finally {
        setRoleRun(null);
      }
    },
    [current],
  );

  const resetUpload = useCallback(() => setUpload({ phase: "idle" }), []);
  const signOut = useCallback(() => {
    setUser(null);
    setHistory([]);
    setUpload({ phase: "idle" });
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const pickFile = useCallback(() => {
    if (!requireAccount()) return;
    inputRef.current?.click();
  }, [requireAccount]);

  const value = useMemo(
    () => ({
      history,
      current,
      user,
      offline,
      role,
      setRole,
      setUser,
      upload,
      rateFile,
      addVersion,
      resetUpload,
      pickFile,
      refresh,
      rateForRole,
      roleRun,
      signOut,
    }),
    [
      history,
      current,
      user,
      offline,
      role,
      upload,
      rateFile,
      addVersion,
      resetUpload,
      pickFile,
      refresh,
      rateForRole,
      roleRun,
      signOut,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPTED_FORMATS.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void rateFile(file);
        }}
      />
    </Ctx.Provider>
  );
}
