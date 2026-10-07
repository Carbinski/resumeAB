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
import { deleteVersion, getHistory, isSupportedResume, publishVersion, rateRole, uploadResume } from "@/lib/api";
import { ACCEPTED_FORMATS } from "@/lib/brand";
import { labelFromFileName } from "@/lib/labels";
import { SAMPLE_HISTORY } from "@/lib/sampleHistory";
import type { RoleId } from "@/lib/roles";
import type { Account, ResumeVersion } from "@/lib/types";

export type UploadStatus =
  | { phase: "idle" }
  | { phase: "naming"; fileName: string; suggested: string }
  | { phase: "processing"; fileName: string; label: string }
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
  /** Holds a chosen file and asks for a name before anything is stored. */
  proposeFile: (file: File) => void;
  /** Stores the pending file under the name the user confirmed. */
  confirmName: (label: string) => Promise<ResumeVersion | null>;
  cancelNaming: () => void;
  /** Tombstones one resume and drops it from the history. */
  removeVersion: (id: string) => Promise<void>;
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

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function refreshedUpload(state: UploadStatus, next: ResumeVersion[]): UploadStatus {
  if (state.phase !== "done") return state;
  const updated = next.find((version) => version.id === state.version.id);
  if (!updated) return state;
  const index = next.findIndex((version) => version.id === updated.id);
  const previous = index > 0 ? next[index - 1] : undefined;
  return {
    phase: "done",
    version: updated,
    delta: previous ? updated.ratings.overall - previous.ratings.overall : state.delta,
  };
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
  const pendingFile = useRef<File | null>(null);
  const confirming = useRef(false);
  const removedIds = useRef(new Set<string>());

  const withoutRemoved = useCallback((next: ResumeVersion[]) => {
    const hidden = removedIds.current;
    if (hidden.size === 0) return next;
    return next.filter((version) => !hidden.has(version.id));
  }, []);

  const history = demo ? SAMPLE_HISTORY : liveHistory;
  const current = history.length > 0 ? history[history.length - 1] : null;

  const enterDemo = useCallback(() => {
    pendingFile.current = null;
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
    setLiveHistory(withoutRemoved(await getHistory()));
  }, [demo, withoutRemoved]);

  useEffect(() => {
    if (demo || !liveHistory.some(needsPoll)) return;
    const timer = setInterval(() => {
      void getHistory()
        .then((next) => {
          const visible = withoutRemoved(next);
          setLiveHistory(visible);
          setUpload((state) => refreshedUpload(state, visible));
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [demo, liveHistory, withoutRemoved]);

  const requireAccount = useCallback(() => {
    if (user) return true;
    setUpload({ phase: "error", message: "Create an account before uploading." });
    document.getElementById("account")?.scrollIntoView({ behavior: "smooth" });
    return false;
  }, [user]);

  const rejectDemo = useCallback(
    (message: string) => {
      if (!demo) return false;
      setUpload({ phase: "error", message });
      return true;
    },
    [demo],
  );

  const proposeFile = useCallback(
    (file: File) => {
      if (rejectDemo("Leave sample history before uploading.")) return;
      if (!requireAccount()) return;
      if (upload.phase === "processing") return;
      if (!isSupportedResume(file.name)) {
        pendingFile.current = null;
        setUpload({
          phase: "error",
          message: `Unsupported file type. Use ${ACCEPTED_FORMATS.join(", ")}.`,
        });
        return;
      }
      pendingFile.current = file;
      setUpload({
        phase: "naming",
        fileName: file.name,
        suggested: labelFromFileName(file.name),
      });
    },
    [rejectDemo, requireAccount, upload.phase],
  );

  const confirmName = useCallback(
    async (label: string) => {
      if (rejectDemo("Leave sample history before uploading.")) return null;
      const file = pendingFile.current;
      const name = label.trim();
      if (!file || !name || confirming.current) return null;
      if (!requireAccount()) return null;
      confirming.current = true;
      setUpload({ phase: "processing", fileName: file.name, label: name });
      const baseline = current;
      try {
        const version = await uploadResume(file, {
          baseline: baseline ?? undefined,
          label: name,
        });
        pendingFile.current = null;
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
        pendingFile.current = null;
        setUpload({ phase: "error", message: messageFrom(error, "Something went wrong.") });
        try {
          setLiveHistory(withoutRemoved(await getHistory()));
        } catch {
          // The dropzone already shows the upload error.
        }
        return null;
      } finally {
        confirming.current = false;
      }
    },
    [current, rejectDemo, requireAccount, withoutRemoved],
  );

  const cancelNaming = useCallback(() => {
    pendingFile.current = null;
    setUpload({ phase: "idle" });
  }, []);

  const removeVersion = useCallback(async (id: string) => {
    if (rejectDemo("Leave sample history before removing a resume.")) return;
    await deleteVersion(id);
    removedIds.current.add(id);
    setLiveHistory((items) => items.filter((item) => item.id !== id));
    setUpload((state) =>
      state.phase === "done" && state.version.id === id ? { phase: "idle" } : state,
    );
  }, [rejectDemo]);

  const addVersion = useCallback(async (version: ResumeVersion) => {
    if (rejectDemo("Leave sample history before saving a version.")) return null;
    try {
      const published = await publishVersion(version.id);
      setLiveHistory((items) =>
        items.some((item) => item.id === published.id)
          ? items.map((item) => (item.id === published.id ? published : item))
          : [...items, published],
      );
      return published;
    } catch (error) {
      setUpload({ phase: "error", message: messageFrom(error, "Could not keep that version.") });
      return null;
    }
  }, [rejectDemo]);

  const rateForRole = useCallback(
    async (nextRole: Exclude<RoleId, "overall">) => {
      if (rejectDemo("Leave sample history before rating a role.")) return;
      const latest = current;
      if (!latest) return;
      setRoleRun(nextRole);
      try {
        const version = await rateRole(latest.id, nextRole);
        setLiveHistory((items) => items.map((item) => (item.id === version.id ? version : item)));
      } catch (error) {
        setUpload({ phase: "error", message: messageFrom(error, "Could not rate this role.") });
      } finally {
        setRoleRun(null);
      }
    },
    [current, rejectDemo],
  );

  const resetUpload = useCallback(() => {
    pendingFile.current = null;
    setUpload({ phase: "idle" });
  }, []);
  const signOut = useCallback(() => {
    pendingFile.current = null;
    removedIds.current.clear();
    setUser(null);
    setLiveHistory([]);
    setUpload({ phase: "idle" });
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const pickFile = useCallback(() => {
    if (rejectDemo("Leave sample history before uploading.")) return;
    if (!requireAccount()) return;
    inputRef.current?.click();
  }, [rejectDemo, requireAccount]);

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
      proposeFile,
      confirmName,
      cancelNaming,
      removeVersion,
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
      proposeFile,
      confirmName,
      cancelNaming,
      removeVersion,
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
          if (file) proposeFile(file);
        }}
      />
    </Ctx.Provider>
  );
}
