import { CATEGORIES, type CategoryId } from "./categories";
import { winProbability } from "./elo";
import { categoryElo, placedRoleScore } from "./ratings";
import { TRACK_IDS, type RoleId, type TrackId } from "./roles";
import type {
  CategoryDuel,
  CompareResult,
  NeighborCard,
  OrderResult,
  ResumeVersion,
  RoleRatings,
  Standing,
} from "./types";

/** Client-only scores for Jordan Hale. Nothing here is uploaded or judged. */
const BANDS = [
  { id: "under-900", label: "Under 900" },
  { id: "900–1000", label: "900–1000" },
  { id: "1000–1100", label: "1000–1100" },
  { id: "1100–1250", label: "1100–1250" },
  { id: "1250+", label: "1250+" },
] as const;

type BandLabel = (typeof BANDS)[number]["label"];
type CategoryScores = Record<CategoryId, number>;
type NeighborSpec = readonly [company: string | null, relation: NeighborCard["relation"]];

function histogram(counts: readonly [number, number, number, number, number]) {
  return BANDS.map((band, index) => ({ ...band, count: counts[index] }));
}

function card(company: string | null, relation: NeighborCard["relation"]): NeighborCard {
  return {
    company,
    level: "intern",
    levelLabel: "Intern",
    industry: "software",
    industryLabel: "Software",
    relation,
  };
}

function standing(
  band: BandLabel,
  percentile: number,
  counts: readonly [number, number, number, number, number],
  neighbors: readonly NeighborSpec[],
): Standing {
  return {
    status: "rated",
    message: null,
    band,
    percentile,
    histogram: histogram(counts),
    neighbors: neighbors.map(([company, relation]) => card(company, relation)),
    widened: false,
    matchesPlayed: 8,
    matchBudget: 8,
  };
}

function ratings(overall: number, tracks: Partial<Record<TrackId, number | null>>): RoleRatings {
  const filled = Object.fromEntries(
    TRACK_IDS.map((id) => [id, tracks[id] ?? null]),
  ) as Record<TrackId, number | null>;
  return { overall, ...filled };
}

function roleStatus(tracks: Partial<Record<TrackId, number | null>>): ResumeVersion["roleStatus"] {
  return Object.fromEntries(
    TRACK_IDS.map((id) => [
      id,
      tracks[id] == null ? null : { status: "rated" as const, message: null },
    ]),
  ) as ResumeVersion["roleStatus"];
}

function sample(row: {
  id: string;
  label: string;
  fileName: string;
  uploadedAt: string;
  note: string;
  overall: number;
  ai: number | null;
  cloud?: number | null;
  categories: CategoryScores;
  band: BandLabel;
  percentile: number;
  counts: readonly [number, number, number, number, number];
  neighbors: readonly NeighborSpec[];
}): ResumeVersion {
  const tracks = { ai: row.ai, cloud: row.cloud ?? null };
  return {
    level: "intern",
    industry: "software",
    company: null,
    id: row.id,
    label: row.label,
    fileName: row.fileName,
    uploadedAt: row.uploadedAt,
    note: row.note,
    ratings: ratings(row.overall, tracks),
    categories: row.categories,
    roleStatus: roleStatus(tracks),
    standing: standing(row.band, row.percentile, row.counts, row.neighbors),
  };
}

export const SAMPLE_HISTORY: ResumeVersion[] = [
  sample({
    id: "sample-first-draft",
    label: "First draft",
    fileName: "jordan-hale-first-draft.pdf",
    uploadedAt: "2026-03-12T15:00:00.000Z",
    note: "First pass. Projects read like a task list, and nothing shows what Jordan owned.",
    overall: 978,
    ai: null,
    categories: { impact: 940, depth: 1012, leadership: 888, fit: 966, trajectory: 952, clarity: 1034 },
    band: "900–1000",
    percentile: 0.35,
    counts: [5, 12, 8, 4, 2],
    neighbors: [["Keel", "same"], ["Brightline", "above"], [null, "below"]],
  }),
  sample({
    id: "sample-projects",
    label: "Projects rewritten",
    fileName: "jordan-hale-projects.pdf",
    uploadedAt: "2026-05-02T15:00:00.000Z",
    note: "Rewrote both projects with numbers: a retrieval demo, and the latency Jordan cut.",
    overall: 1066,
    ai: null,
    categories: { impact: 1072, depth: 1118, leadership: 948, fit: 1054, trajectory: 1040, clarity: 1096 },
    band: "1000–1100",
    percentile: 0.5,
    counts: [5, 13, 9, 5, 2],
    neighbors: [["Brightline", "same"], ["Fieldnote", "above"], ["Keel", "below"]],
  }),
  sample({
    id: "sample-internship",
    label: "Internship bullets",
    fileName: "jordan-hale-internship.pdf",
    uploadedAt: "2026-06-21T15:00:00.000Z",
    note: "Added the summer internship: a ranking feature, and the offline eval Jordan ran.",
    overall: 1152,
    ai: 1104,
    categories: { impact: 1176, depth: 1194, leadership: 1028, fit: 1160, trajectory: 1182, clarity: 1136 },
    band: "1100–1250",
    percentile: 0.7,
    counts: [6, 14, 11, 7, 3],
    neighbors: [["Fieldnote", "same"], ["Halcyon", "above"], ["Brightline", "below"]],
  }),
  sample({
    id: "sample-one-page",
    label: "Tightened to one page",
    fileName: "jordan-hale-one-page.pdf",
    uploadedAt: "2026-08-08T15:00:00.000Z",
    note: "Cut to a single page. Dropped the older club role and shortened every bullet.",
    overall: 1228,
    ai: 1196,
    categories: { impact: 1214, depth: 1238, leadership: 1122, fit: 1252, trajectory: 1220, clarity: 1308 },
    band: "1100–1250",
    percentile: 0.8,
    counts: [6, 15, 13, 9, 4],
    neighbors: [["Fieldnote", "same"], ["Halcyon", "above"], ["Brightline", "below"]],
  }),
  sample({
    id: "sample-final",
    label: "Final",
    fileName: "jordan-hale-final.pdf",
    uploadedAt: "2026-09-18T15:00:00.000Z",
    note: "Final before applications. The internship now says Jordan led the eval, which was the missing piece.",
    overall: 1291,
    ai: 1314,
    categories: { impact: 1302, depth: 1320, leadership: 1284, fit: 1306, trajectory: 1268, clarity: 1332 },
    band: "1250+",
    percentile: 0.9,
    counts: [7, 16, 14, 11, 5],
    neighbors: [["Halcyon", "same"], ["Northwind", "same"], ["Fieldnote", "below"]],
  }),
];

/** Lab pair, separate from Jordan Hale and off the rating chart. Full-stack stays unrated. */
const LAB_STANDING = {
  band: "1100–1250" as const,
  percentile: 0.72,
  counts: [6, 14, 12, 8, 3] as const,
  neighbors: [
    ["Fieldnote", "same"],
    ["Halcyon", "above"],
    ["Brightline", "below"],
  ] as const satisfies readonly NeighborSpec[],
};

export const AI_ML_RESUME: ResumeVersion = sample({
  id: "fixture-ai-ml",
  label: "AI & ML resume",
  fileName: "ai-ml-resume.pdf",
  uploadedAt: "2026-10-01T15:00:00.000Z",
  note: "Tailored for AI and ML: model work, evaluation, and a retrieval pipeline.",
  overall: 1210,
  ai: 1380,
  cloud: 990,
  categories: { impact: 1202, depth: 1224, leadership: 1194, fit: 1210, trajectory: 1206, clarity: 1218 },
  ...LAB_STANDING,
});

export const CLOUD_OPS_RESUME: ResumeVersion = sample({
  id: "fixture-cloud-ops",
  label: "Cloud Ops resume",
  fileName: "cloud-ops-resume.pdf",
  uploadedAt: "2026-10-02T15:00:00.000Z",
  note: "Tailored for Cloud Ops: deploys, reliability, and the cost of running them.",
  overall: 1230,
  ai: 1020,
  cloud: 1400,
  categories: { impact: 1222, depth: 1208, leadership: 1214, fit: 1230, trajectory: 1214, clarity: 1226 },
  ...LAB_STANDING,
  percentile: 0.74,
});

const SAMPLE_MODEL = "sample-elo";

function agreedOrder(left: "a" | "b", pLeftStronger: number): OrderResult {
  const right = 1 - pLeftStronger;
  return {
    left,
    choice: pLeftStronger >= right ? "left" : "right",
    probabilities: { left: pLeftStronger, right },
    confidence: Math.abs(pLeftStronger - right),
    noul: pLeftStronger,
    model: SAMPLE_MODEL,
  };
}

/** Head-to-head from fixture scores. A missing placed score returns null. Not a judge call. */
export function compareSampleVersions(
  a: ResumeVersion,
  b: ResumeVersion,
  role: RoleId,
): CompareResult | null {
  const eloA = placedRoleScore(a, role);
  const eloB = placedRoleScore(b, role);
  if (eloA == null || eloB == null) return null;
  const pB = winProbability(eloB, eloA);
  const categories: CategoryDuel[] = CATEGORIES.flatMap((def) => {
    const catA = categoryElo(a, def.id, role);
    const catB = categoryElo(b, def.id, role);
    if (catA == null || catB == null) return [];
    return [{ id: def.id, pB: winProbability(catB, catA), eloA: catA, eloB: catB }];
  });
  return {
    a,
    b,
    role,
    pB,
    eloA,
    eloB,
    orders: [agreedOrder("a", 1 - pB), agreedOrder("b", pB)],
    categories,
  };
}

/** Stored Elo only. A missing role score stays missing. Drafts are not in `libraryIds`. */
export function compareStoredScores(
  a: ResumeVersion,
  b: ResumeVersion,
  role: RoleId,
  libraryIds: ReadonlySet<string>,
): CompareResult | null {
  if (a.id === b.id) return null;
  if (!libraryIds.has(a.id) || !libraryIds.has(b.id)) return null;
  return compareSampleVersions(a, b, role);
}
