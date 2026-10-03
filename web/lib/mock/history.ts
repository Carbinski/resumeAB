import { CATEGORIES, type CategoryId } from "../categories";
import type { RoleId } from "../roles";
import type { ResumeVersion } from "../types";

interface Seed {
  date: string;
  note: string;
  overall: number;
  ai: number;
  cloud: number;
  fullstack: number;
}

const SEEDS: Seed[] = [
  { date: "2026-04-06", note: "First upload. Original two-page layout.", overall: 958, ai: 921, cloud: 949, fullstack: 972 },
  { date: "2026-04-28", note: "Rewrote the summary and trimmed to one page.", overall: 971, ai: 934, cloud: 968, fullstack: 990 },
  { date: "2026-05-19", note: "Swapped bullets for a dense skills grid.", overall: 949, ai: 915, cloud: 971, fullstack: 958 },
  { date: "2026-06-09", note: "Added a metric to every experience bullet.", overall: 1004, ai: 983, cloud: 1009, fullstack: 1021 },
  { date: "2026-06-30", note: "Moved projects above education.", overall: 1038, ai: 1031, cloud: 1026, fullstack: 1057 },
  { date: "2026-07-28", note: "Added a platform migration case study.", overall: 1031, ai: 1049, cloud: 1043, fullstack: 1034 },
  { date: "2026-08-25", note: "Led with impact. Cut the buzzwords.", overall: 1089, ai: 1102, cloud: 1058, fullstack: 1096 },
  { date: "2026-09-22", note: "Tailored the headline for AI roles.", overall: 1136, ai: 1171, cloud: 1052, fullstack: 1118 },
];

/** Static offsets plus a slow trend so each category tells its own story. */
const CATEGORY_SHAPE: Record<CategoryId, { offset: number; trend: number; phase: number }> = {
  impact: { offset: -34, trend: 82, phase: 0.4 },
  depth: { offset: 26, trend: 14, phase: 1.9 },
  leadership: { offset: -58, trend: 74, phase: 3.1 },
  fit: { offset: 4, trend: 18, phase: 4.2 },
  trajectory: { offset: 8, trend: 22, phase: 5.3 },
  clarity: { offset: 12, trend: 30, phase: 2.6 },
};

function categoriesFor(overall: number, index: number): Record<CategoryId, number> {
  const progress = index / (SEEDS.length - 1);
  return Object.fromEntries(
    CATEGORIES.map(({ id }) => {
      const { offset, trend, phase } = CATEGORY_SHAPE[id];
      const wobble = 9 * Math.sin(index * 1.7 + phase);
      return [id, Math.round(overall + offset + trend * progress + wobble)];
    }),
  ) as Record<CategoryId, number>;
}

export const MOCK_HISTORY: ResumeVersion[] = SEEDS.map((seed, index) => {
  const ratings: Record<RoleId, number> = {
    overall: seed.overall,
    ai: seed.ai,
    cloud: seed.cloud,
    fullstack: seed.fullstack,
  };
  return {
    id: `v${index + 1}`,
    label: `v${index + 1}`,
    fileName: `resume_v${index + 1}.pdf`,
    uploadedAt: new Date(`${seed.date}T12:00:00Z`).toISOString(),
    note: seed.note,
    ratings,
    categories: categoriesFor(seed.overall, index),
  };
});
