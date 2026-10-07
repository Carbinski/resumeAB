export const LEVELS = [
  { id: "intern", label: "Intern" },
  { id: "newgrad", label: "New grad" },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];

export const INDUSTRIES = [
  { id: "aerospace", label: "Aerospace" },
  { id: "defense", label: "Defense" },
  { id: "software", label: "Software" },
  { id: "robotics", label: "Robotics" },
  { id: "consulting", label: "Consulting" },
  { id: "finance", label: "Finance" },
  { id: "biotech", label: "Biotech" },
  { id: "healthcare", label: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "automation", label: "Automation" },
] as const;

export function levelLabel(id: string): string {
  return LEVELS.find((level) => level.id === id)?.label ?? id;
}

export function industryLabel(id: string): string {
  return INDUSTRIES.find((industry) => industry.id === id)?.label ?? id;
}

export const FOCUSES = [
  { id: "cs", label: "Computer science" },
  { id: "mee", label: "Mechanical, electrical, and aerospace" },
  { id: "bme", label: "Biomedical" },
] as const;

export type FocusId = (typeof FOCUSES)[number]["id"];

const FOCUS_FOR_INDUSTRY: Record<string, FocusId> = {
  software: "cs",
  aerospace: "mee",
  manufacturing: "mee",
  automation: "mee",
  biotech: "bme",
  healthcare: "bme",
};

/** A starting degree family. Defense, robotics, consulting, and finance stay unset. */
export function suggestedFocus(industry: string): FocusId | "" {
  return FOCUS_FOR_INDUSTRY[industry] ?? "";
}
