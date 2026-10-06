export type CategoryId =
  | "impact"
  | "depth"
  | "leadership"
  | "fit"
  | "trajectory"
  | "clarity";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  short: string;
  definition: string;
  /** Question a future backend `Choice` would ask for this category. */
  judgePrompt: string;
  /** Fixed hue so a category is recognisable across the page. */
  color: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "impact",
    label: "Impact",
    short: "Impact",
    definition:
      "Concrete, measurable outcomes (numbers, scale, results) rather than lists of duties.",
    judgePrompt:
      "Which resume shows more concrete, measurable impact from the candidate's work?",
    color: "#BC7767",
  },
  {
    id: "depth",
    label: "Technical depth",
    short: "Depth",
    definition:
      "How difficult and sophisticated the problems solved and the tools used are.",
    judgePrompt:
      "Which resume shows deeper technical skill on harder problems?",
    color: "#7E7766",
  },
  {
    id: "leadership",
    label: "Leadership",
    short: "Leadership",
    definition:
      "Leading people or projects, shipping end to end, mentoring, and carrying responsibility beyond assigned tasks.",
    judgePrompt:
      "Which resume shows stronger leadership and ownership of outcomes?",
    color: "#D79B8D",
  },
  {
    id: "fit",
    label: "Role fit",
    short: "Role fit",
    definition:
      "How directly the experience matches the target role. Shifts with the role you select.",
    judgePrompt:
      "Which resume is a closer match to the role in `role_description`?",
    color: "#403926",
  },
  {
    id: "trajectory",
    label: "Trajectory",
    short: "Trajectory",
    definition:
      "Growth over time: increasing scope or seniority, and recent, relevant work.",
    judgePrompt:
      "Which resume shows stronger growth and more recent, relevant work?",
    color: "#AF9D8F",
  },
  {
    id: "clarity",
    label: "Signal clarity",
    short: "Clarity",
    definition:
      "How quickly a reader gets the point: concise, specific, low on filler and buzzwords.",
    judgePrompt: "Which resume communicates its strengths more clearly?",
    color: "#C9A99B",
  },
] as const;

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryDef>;

/** The general metric. Always present, never filtered out. */
export const OVERALL = {
  id: "overall",
  label: "Overall",
  definition:
    "The headline ELO: how often this resume beats others, judged head to head.",
} as const;
