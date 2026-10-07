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
import { SAMPLE_HISTORY } from "@/lib/sampleHistory";
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
  /** Sample history is on screen. Live account data is kept and restored on exit. */
  demo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
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

function setDemoQuery(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function LadderProvider({
  initialHistory,
  initialUser,
  offline,
  initialDemo = false,
  children,
}: {
  initialHistory: ResumeVersion[];
  initialUser: Account | null;
  offline: boolean;
  initialDemo?: boolean;
  children: ReactNode;
}) {
  const [liveHistory, setLiveHistory] = useState(initialHistory);
  const [demo, setDemo] = useState(initialDemo);
  const [user, setUser] = useState(initialUser);
  const [role, setRole] = useState<RoleId>("overall");
  const [upload, setUpload] = useState<UploadStatus>({ phase: "idle" });
  const [roleRun, setRoleRun] = useState<RoleId | null>(null);

  const history = demo ? SAMPLE_HISTORY : liveHistory;
  const current = history.length > 0 ? history[history.length - 1] : null;

  const enterDemo = useCallback(() => {
    setDemo(true);
    setUpload({ phase: "idle" });
    setDemoQuery(true);
  }, []);

  const exitDemo = useCallback(() => {
    setDemo(false);
    setUpload({ phase: "idle" });
    setDemoQuery(false);
  }, []);

  const refresh = useCallback(async () => {
    if (demo) return;
    const next = await getHistory();
    setLiveHistory(next);
    setUpload((state) => {
      if (state.phase !== "done" && state.phase !== "processing") return state;
      return state;
    });
  }, [demo]);

  useEffect(() => {
    if (demo || !liveHistory.some(needsPoll)) return;
    const timer = setInterval(() => {
      void getHistory()
        .then((next) => {
          setLiveHistory(next);
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
  }, [demo, liveHistory]);

  const requireAccount = useCallback(() => {
    if (user) return true;
    setUpload({ phase: "error", message: "Create an account before uploading." });
    document.getElementById("account")?.scrollIntoView({ behavior: "smooth" });
    return false;
  }, [user]);

  const rateFile = useCallback(
    async (file: File) => {
      if (demo) {
        setUpload({ phase: "error", message: "Leave sample history before uploading." });
        return null;
      }
      if (!requireAccount()) return null;
      setUpload({ phase: "processing", fileName: file.name });
      const baseline = current;
      try {
        const version = await uploadResume(file, {
          baseline: baseline ?? undefined,
          label: `v${history.length + 1}`,
        });
        setLiveHistory((items) =>
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
    [current, demo, history.length, requireAccount],
  );

  const addVersion = useCallback(async (version: ResumeVersion) => {
    if (demo) {
      setUpload({ phase: "error", message: "Leave sample history before saving a version." });
      return null;
    }
    try {
      const published = await publishVersion(version.id);
      setLiveHistory((items) =>
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
  }, [demo]);

  const rateForRole = useCallback(
    async (nextRole: Exclude<RoleId, "overall">) => {
      if (demo) {
        setUpload({ phase: "error", message: "Leave sample history before rating a role." });
        return;
      }
      const latest = current;
      if (!latest) return;
      setRoleRun(nextRole);
      try {
        const version = await rateRole(latest.id, nextRole);
        setLiveHistory((items) => items.map((item) => (item.id === version.id ? version : item)));
      } catch (error) {
        setUpload({
          phase: "error",
          message: error instanceof Error ? error.message : "Could not rate this role.",
        });
      } finally {
        setRoleRun(null);
      }
    },
    [current, demo],
  );

  const resetUpload = useCallback(() => setUpload({ phase: "idle" }), []);
  const signOut = useCallback(() => {
    setUser(null);
    setLiveHistory([]);
    setUpload({ phase: "idle" });
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const pickFile = useCallback(() => {
    if (demo) {
      setUpload({ phase: "error", message: "Leave sample history before uploading." });
      return;
    }
    if (!requireAccount()) return;
    inputRef.current?.click();
  }, [demo, requireAccount]);

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
      demo,
      enterDemo,
      exitDemo,
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
      demo,
      enterDemo,
      exitDemo,
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
