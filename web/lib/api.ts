/**
 * The seam between the UI and the rating engine.
 *
 * Every function here resolves from mock data today. To go live, replace the
 * bodies with `fetch` calls that return the same shapes (see `lib/types.ts`).
 */
import { ACCEPTED_FORMATS } from "./brand";
import { CATEGORIES } from "./categories";
import { clamp, winProbability } from "./elo";
import { MOCK_HISTORY } from "./mock/history";
import { categoryElo } from "./ratings";
import { ROLES, type RoleId } from "./roles";
import type {
  CategoryDuel,
  CompareResult,
  OrderResult,
  ResumeVersion,
} from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isSupportedResume(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_FORMATS.some((ext) => lower.endsWith(ext));
}

/** Small deterministic hash so the same file always scores the same in mock mode. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
}

export async function getHistory(): Promise<ResumeVersion[]> {
  return MOCK_HISTORY;
}

export interface UploadOptions {
  /** The version the new one is rated against. */
  baseline: ResumeVersion;
  label: string;
  note?: string;
}

/** Parses and rates one resume file. */
export async function uploadResume(
  file: File,
  { baseline, label, note }: UploadOptions,
): Promise<ResumeVersion> {
  if (!isSupportedResume(file.name)) {
    throw new Error(`Unsupported file type. Use ${ACCEPTED_FORMATS.join(", ")}.`);
  }
  await wait(2600);

  const rand = seeded(`${file.name}:${file.size}:${file.lastModified}`);
  const overallShift = Math.round(-45 + rand() * 150);

  const ratings = Object.fromEntries(
    ROLES.map(({ id }) => {
      const shift = id === "overall" ? overallShift : overallShift + Math.round((rand() - 0.5) * 50);
      return [id, baseline.ratings[id] + shift];
    }),
  ) as Record<RoleId, number>;

  const categories = Object.fromEntries(
    CATEGORIES.map(({ id }) => [
      id,
      Math.round(baseline.categories[id] + overallShift + (rand() - 0.5) * 70),
    ]),
  ) as ResumeVersion["categories"];

  return {
    id: `up-${Date.now().toString(36)}`,
    label,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    note: note ?? "Uploaded just now.",
    ratings,
    categories,
  };
}

function orderResult(left: "a" | "b", noul: number): OrderResult {
  const p = clamp(noul, 0.02, 0.98);
  return {
    left,
    choice: p >= 0.5 ? "left" : "right",
    probabilities: { left: p, right: 1 - p },
    confidence: Math.abs(2 * p - 1),
    noul: p,
    model: "mock-judge-1",
  };
}

/** Head-to-head between two versions for one role, in both reading orders. */
export async function compareVersions(
  a: ResumeVersion,
  b: ResumeVersion,
  role: RoleId,
): Promise<CompareResult> {
  await wait(3400);

  const eloA = a.ratings[role];
  const eloB = b.ratings[role];
  const pA = winProbability(eloA, eloB);
  const rand = seeded(`${a.id}:${b.id}:${role}`);
  // A positive bias favours whichever resume is shown on the left.
  const bias = (rand() - 0.5) * 0.14;

  const categories: CategoryDuel[] = CATEGORIES.map(({ id }) => {
    const ca = categoryElo(a, id, role);
    const cb = categoryElo(b, id, role);
    return { id, pB: winProbability(cb, ca), eloA: ca, eloB: cb };
  });

  return {
    a,
    b,
    role,
    pB: 1 - pA,
    eloA,
    eloB,
    orders: [orderResult("a", pA + bias), orderResult("b", 1 - pA + bias)],
    categories,
  };
}
