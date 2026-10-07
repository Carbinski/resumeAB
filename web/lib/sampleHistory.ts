import { CATEGORIES } from "./categories";
import { winProbability } from "./elo";
import { categoryElo } from "./ratings";
import type { RoleId } from "./roles";
import type {
  CategoryDuel,
  CompareResult,
  NeighborCard,
  OrderResult,
  ResumeVersion,
  Standing,
} from "./types";

/**
 * Client-only history for one fictional intern, Jordan Hale.
 * Scores are baked in. Nothing here is uploaded or sent to the judge.
 */
const BANDS = [
  { id: "under-900", label: "Under 900" },
  { id: "900–1000", label: "900–1000" },
  { id: "1000–1100", label: "1000–1100" },
  { id: "1100–1250", label: "1100–1250" },
  { id: "1250+", label: "1250+" },
] as const;

type BandLabel = (typeof BANDS)[number]["label"];

function histogram(counts: readonly [number, number, number, number, number]) {
  return BANDS.map((band, index) => ({ ...band, count: counts[index] }));
}

function card(
  company: string | null,
  relation: NeighborCard["relation"],
): NeighborCard {
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
  neighbors: NeighborCard[],
): Standing {
  return {
    status: "rated",
    message: null,
    band,
    percentile,
    histogram: histogram(counts),
    neighbors,
    widened: false,
    matchesPlayed: 8,
    matchBudget: 8,
  };
}

const UNRATED = { ai: null, cloud: null, fullstack: null };
const AI_RATED = {
  ai: { status: "rated" as const, message: null },
  cloud: null,
  fullstack: null,
};

function version(
  fields: Pick<ResumeVersion, "id" | "label" | "fileName" | "uploadedAt" | "note" | "ratings" | "categories" | "standing" | "roleStatus">,
): ResumeVersion {
  return { level: "intern", ...fields };
}

export const SAMPLE_HISTORY: ResumeVersion[] = [
  version({
    id: "sample-first-draft",
    label: "First draft",
    fileName: "jordan-hale-first-draft.pdf",
    uploadedAt: "2026-03-12T15:00:00.000Z",
    note: "First pass. Projects read like a task list, and nothing shows what Jordan owned.",
    ratings: { overall: 978, ai: null, cloud: null, fullstack: null },
    categories: {
      impact: 940,
      depth: 1012,
      leadership: 888,
      fit: 966,
      trajectory: 952,
      clarity: 1034,
    },
    roleStatus: UNRATED,
    standing: standing("900–1000", 0.35, [5, 12, 8, 4, 2], [
      card("Keel", "same"),
      card("Brightline", "above"),
      card(null, "below"),
    ]),
  }),
  version({
    id: "sample-projects",
    label: "Projects rewritten",
    fileName: "jordan-hale-projects.pdf",
    uploadedAt: "2026-05-02T15:00:00.000Z",
    note: "Rewrote both projects with numbers: a retrieval demo, and the latency Jordan cut.",
    ratings: { overall: 1066, ai: null, cloud: null, fullstack: null },
    categories: {
      impact: 1072,
      depth: 1118,
      leadership: 948,
      fit: 1054,
      trajectory: 1040,
      clarity: 1096,
    },
    roleStatus: UNRATED,
    standing: standing("1000–1100", 0.5, [5, 13, 9, 5, 2], [
      card("Brightline", "same"),
      card("Fieldnote", "above"),
      card("Keel", "below"),
    ]),
  }),
  version({
    id: "sample-internship",
    label: "Internship bullets",
    fileName: "jordan-hale-internship.pdf",
    uploadedAt: "2026-06-21T15:00:00.000Z",
    note: "Added the summer internship: a ranking feature, and the offline eval Jordan ran.",
    ratings: { overall: 1152, ai: 1104, cloud: null, fullstack: null },
    categories: {
      impact: 1176,
      depth: 1194,
      leadership: 1028,
      fit: 1160,
      trajectory: 1182,
      clarity: 1136,
    },
    roleStatus: AI_RATED,
    standing: standing("1100–1250", 0.7, [6, 14, 11, 7, 3], [
      card("Fieldnote", "same"),
      card("Halcyon", "above"),
      card("Brightline", "below"),
    ]),
  }),
  version({
    id: "sample-one-page",
    label: "Tightened to one page",
    fileName: "jordan-hale-one-page.pdf",
    uploadedAt: "2026-08-08T15:00:00.000Z",
    note: "Cut to a single page. Dropped the older club role and shortened every bullet.",
    ratings: { overall: 1228, ai: 1196, cloud: null, fullstack: null },
    categories: {
      impact: 1214,
      depth: 1238,
      leadership: 1122,
      fit: 1252,
      trajectory: 1220,
      clarity: 1308,
    },
    roleStatus: AI_RATED,
    standing: standing("1100–1250", 0.8, [6, 15, 13, 9, 4], [
      card("Fieldnote", "same"),
      card("Halcyon", "above"),
      card("Brightline", "below"),
    ]),
  }),
  version({
    id: "sample-final",
    label: "Final",
    fileName: "jordan-hale-final.pdf",
    uploadedAt: "2026-09-18T15:00:00.000Z",
    note: "Final before applications. The internship now says Jordan led the eval, which was the missing piece.",
    ratings: { overall: 1291, ai: 1314, cloud: null, fullstack: null },
    categories: {
      impact: 1302,
      depth: 1320,
      leadership: 1284,
      fit: 1306,
      trajectory: 1268,
      clarity: 1332,
    },
    roleStatus: AI_RATED,
    standing: standing("1250+", 0.9, [7, 16, 14, 11, 5], [
      card("Halcyon", "same"),
      card("Northwind", "same"),
      card("Fieldnote", "below"),
    ]),
  }),
];

const SAMPLE_MODEL = "sample-elo";

function eloFor(version: ResumeVersion, role: RoleId): number {
  return version.ratings[role] ?? version.ratings.overall;
}

/** Both orders agree, because the probability comes only from the Elo gap. */
function order(left: "a" | "b", pLeftStronger: number): OrderResult {
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

/** Head-to-head from fixture scores. A 400-point gap is 10-to-1. Not a judge call. */
export function compareSampleVersions(
  a: ResumeVersion,
  b: ResumeVersion,
  role: RoleId,
): CompareResult {
  const eloA = eloFor(a, role);
  const eloB = eloFor(b, role);
  const pB = winProbability(eloB, eloA);
  const categories: CategoryDuel[] = [];
  for (const def of CATEGORIES) {
    const catA = categoryElo(a, def.id, role);
    const catB = categoryElo(b, def.id, role);
    if (catA == null || catB == null) continue;
    categories.push({
      id: def.id,
      pB: winProbability(catB, catA),
      eloA: catA,
      eloB: catB,
    });
  }
  return {
    a,
    b,
    role,
    pB,
    eloA,
    eloB,
    orders: [order("a", 1 - pB), order("b", pB)],
    categories,
  };
}
