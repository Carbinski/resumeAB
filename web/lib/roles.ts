export type RoleId = "overall" | "ai" | "cloud" | "fullstack";

export interface RoleTrack {
  id: RoleId;
  label: string;
  short: string;
  blurb: string;
}

export const ROLES: readonly RoleTrack[] = [
  {
    id: "overall",
    label: "Overall",
    short: "Overall",
    blurb: "Judged on its own, with no target role.",
  },
  {
    id: "ai",
    label: "AI & ML",
    short: "AI & ML",
    blurb: "Model work, data pipelines, evaluation, research-to-production.",
  },
  {
    id: "cloud",
    label: "Cloud Ops",
    short: "Cloud Ops",
    blurb: "Infrastructure, reliability, deploy tooling, cost and scale.",
  },
  {
    id: "fullstack",
    label: "Full-stack",
    short: "Full-stack",
    blurb: "Product engineering across the UI, API and data layers.",
  },
] as const;

export const ROLE_BY_ID = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
) as Record<RoleId, RoleTrack>;

export const SPECIFIC_ROLES = ROLES.filter((r) => r.id !== "overall");
