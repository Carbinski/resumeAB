import type { FocusId } from "./cohort";

export const TRACK_IDS = [
  "ai",
  "cloud",
  "fullstack",
  "embedded",
  "mechanical",
  "flight",
  "devices",
  "biodata",
] as const;

export type TrackId = (typeof TRACK_IDS)[number];
export type RoleId = "overall" | TrackId;

export interface RoleTrack {
  id: RoleId;
  label: string;
  short: string;
  blurb: string;
  /** New pools still use the computer-science calibration resumes. */
  againstCalibration?: boolean;
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
  {
    id: "embedded",
    label: "Embedded",
    short: "Embedded",
    blurb: "Firmware, circuits, boards, and test equipment.",
    againstCalibration: true,
  },
  {
    id: "mechanical",
    label: "Mechanical",
    short: "Mechanical",
    blurb: "Mechanisms, CAD, manufacturing, and hardware test.",
    againstCalibration: true,
  },
  {
    id: "flight",
    label: "Flight systems",
    short: "Flight",
    blurb: "Structures, flight systems, guidance, and vehicles.",
    againstCalibration: true,
  },
  {
    id: "devices",
    label: "Devices",
    short: "Devices",
    blurb: "Instrumentation, implants, and imaging hardware.",
    againstCalibration: true,
  },
  {
    id: "biodata",
    label: "Biodata",
    short: "Biodata",
    blurb: "Lab or clinical data, analysis pipelines, and bioinformatics.",
    againstCalibration: true,
  },
] as const;

export const ROLE_BY_ID = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
) as Record<RoleId, RoleTrack>;

/** Degree family to the tracks that family rates. Industry is a separate fact. */
export const FOCUS_TRACKS: Record<FocusId, readonly TrackId[]> = {
  cs: ["ai", "cloud", "fullstack"],
  mee: ["embedded", "mechanical", "flight"],
  bme: ["devices", "biodata"],
};

const SAMPLE_ROLE_IDS: readonly RoleId[] = ["overall", "ai", "cloud", "fullstack"];
/** The lab pair flips between AI & ML and Cloud Ops. Full-stack stays off this control. */
const SAMPLE_LAB_ROLE_IDS: readonly RoleId[] = ["overall", "ai", "cloud"];

export function isFocusId(value: string | null | undefined): value is FocusId {
  return value === "cs" || value === "mee" || value === "bme";
}

export function tracksForFocus(focus: string | null | undefined): readonly TrackId[] {
  return isFocusId(focus) ? FOCUS_TRACKS[focus] : [];
}

/** Chart and role rungs. Sample history stays the software intern, with no new tracks. */
export function visibleRoleIds(demo: boolean, focus: string | null | undefined): readonly RoleId[] {
  if (demo) return SAMPLE_ROLE_IDS;
  return ["overall", ...tracksForFocus(focus)];
}

/** Lab "Judge for" control. Demo keeps the pair that can flip the scale. */
export function labRoleIds(demo: boolean, focus: string | null | undefined): readonly RoleId[] {
  if (demo) return SAMPLE_LAB_ROLE_IDS;
  return visibleRoleIds(false, focus);
}

/**
 * Tracks for the lab strip.
 * Sample history uses stored scores both resumes already have, and does not
 * list every track. A signed-in focus lists that focus only.
 */
export function stripTrackIds(
  demo: boolean,
  focus: string | null | undefined,
  aRatings: Partial<Record<TrackId, number | null>>,
  bRatings: Partial<Record<TrackId, number | null>>,
): TrackId[] {
  if (demo) {
    return TRACK_IDS.filter((id) => aRatings[id] != null && bRatings[id] != null);
  }
  return [...tracksForFocus(focus)];
}
