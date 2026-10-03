export const LEVELS = [
  { id: "intern", label: "Intern" },
  { id: "newgrad", label: "New grad" },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];

export const INDUSTRIES = [
  { id: "software", label: "Software" },
  { id: "finance", label: "Finance" },
  { id: "consulting", label: "Consulting" },
  { id: "healthcare", label: "Healthcare" },
  { id: "hardware", label: "Hardware" },
  { id: "government", label: "Government" },
  { id: "other", label: "Other" },
] as const;

export function levelLabel(id: string): string {
  return LEVELS.find((level) => level.id === id)?.label ?? id;
}

export function industryLabel(id: string): string {
  return INDUSTRIES.find((industry) => industry.id === id)?.label ?? id;
}
