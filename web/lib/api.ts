/**
 * The seam between the UI and the rating service.
 * Calls go to `/api/ladder`, which proxies the Python service.
 */
import { ACCEPTED_FORMATS } from "./brand";
import { LABEL_MAX } from "./labels";
import type { RoleId } from "./roles";
import type { Account, CompareResult, ResumeVersion } from "./types";

const WAIT_MS = 1500;
const WAIT_LIMIT_MS = 10 * 60 * 1000;

export function isSupportedResume(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_FORMATS.some((ext) => lower.endsWith(ext));
}

function sampleHistoryIsOpen(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && sampleHistoryIsOpen()) {
    throw new Error("Leave sample history before changing anything.");
  }
  const response = await fetch(`/api/ladder${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = "Something went wrong.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Keep the fallback.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export async function getHistory(): Promise<ResumeVersion[]> {
  const response = await fetch("/api/ladder/versions", { credentials: "include", cache: "no-store" });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error("Could not load your resumes.");
  return (await response.json()) as ResumeVersion[];
}

export async function getMe(): Promise<Account | null> {
  const response = await fetch("/api/ladder/me", { credentials: "include", cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Could not load your account.");
  return (await response.json()) as Account;
}

export interface SignupInput {
  email: string;
  password: string;
  nameOnResume: string;
  level: "intern" | "newgrad";
  industry: string;
  company: string;
}

export function signup(input: SignupInput): Promise<Account> {
  return request("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export function login(email: string, password: string): Promise<Account> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<{ ok: boolean }> {
  return request("/auth/logout", { method: "POST" });
}

export function updateProfile(input: Omit<SignupInput, "email" | "password">): Promise<Account> {
  return request("/me", { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAccount(): Promise<{ ok: boolean }> {
  return request("/me", { method: "DELETE" });
}

export function deleteVersion(id: string): Promise<{ ok: boolean }> {
  return request(`/versions/${id}`, { method: "DELETE" });
}

export interface UploadOptions {
  /** The version the new one is rated against. Unused by the service; kept for the lab call site. */
  baseline?: ResumeVersion;
  label?: string;
  note?: string;
  /** A lab draft is stored but not placed on the ladder until it is kept. */
  draft?: boolean;
}

/** Parses and rates one resume file. Drafts return before any pool matchups. */
export async function uploadResume(file: File, options: UploadOptions = {}): Promise<ResumeVersion> {
  if (!isSupportedResume(file.name)) {
    throw new Error(`Unsupported file type. Use ${ACCEPTED_FORMATS.join(", ")}.`);
  }
  const body = new FormData();
  body.append("file", file);
  body.append("note", options.note ?? "");
  body.append("draft", options.draft ? "true" : "false");
  const label = options.label?.trim().slice(0, LABEL_MAX) ?? "";
  if (label) body.append("label", label);
  const created = await request<ResumeVersion>("/versions", { method: "POST", body });
  if (options.draft) return created;
  return waitForVersion(created.id, (version) => version.standing.status !== "placing");
}

export async function publishVersion(id: string): Promise<ResumeVersion> {
  await request<ResumeVersion>(`/versions/${id}/publish`, { method: "POST" });
  return waitForVersion(id, (version) => version.standing.status !== "placing");
}

export async function rateRole(id: string, role: Exclude<RoleId, "overall">): Promise<ResumeVersion> {
  await request<ResumeVersion>(`/versions/${id}/roles/${role}`, { method: "POST" });
  const version = await waitForVersion(id, (item) => {
    const run = item.roleStatus[role];
    return run != null && run.status !== "placing";
  });
  const run = version.roleStatus[role];
  if (run?.status === "error") {
    throw new Error(run.message || "The judge could not rate this role.");
  }
  return version;
}

/** Head-to-head between two versions for one role, in both reading orders. */
export async function compareVersions(
  a: ResumeVersion,
  b: ResumeVersion,
  role: RoleId,
  jd?: string,
): Promise<CompareResult> {
  return request("/compare", {
    method: "POST",
    body: JSON.stringify({ aId: a.id, bId: b.id, role, jd: jd ?? null }),
  });
}

async function waitForVersion(
  id: string,
  ready: (version: ResumeVersion) => boolean,
): Promise<ResumeVersion> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    const history = await getHistory();
    const version = history.find((item) => item.id === id);
    if (version && ready(version)) {
      if (version.standing.status === "error") {
        throw new Error(version.standing.message || "The judge could not rate this resume.");
      }
      return version;
    }
    if (Date.now() > deadline) {
      throw new Error("Rating is still running. It will finish in the background.");
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
}
