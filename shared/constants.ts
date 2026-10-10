// CivicLens shared constants — single source of truth for enums + weights.
// Server imports this file relatively; client mirrors it in client/src/lib/constants.ts
// (kept in sync by convention + backend tests). Do not edit weights without updating tests.

export const ISSUE_CATEGORIES = [
  "pothole",
  "garbage",
  "streetlight",
  "water_leakage",
  "sidewalk",
  "infrastructure",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "rejected",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const USER_ROLES = ["citizen", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Priority weights — formula lives in server/src/utils/priority.ts */
export const PRIORITY_WEIGHTS = {
  severityMax: 40,
  severityByLevel: { low: 10, medium: 22, high: 32, critical: 40 },
  ageMax: 20,
  agePointsPerDay: 2,
  verificationMax: 20,
  verificationPointsEach: 4,
  categoryImpact: {
    water_leakage: 10,
    garbage: 8,
    pothole: 8,
    streetlight: 7,
    infrastructure: 7,
    sidewalk: 6,
    other: 5,
  } as Record<string, number>,
  neglectMax: 10,
} as const;

/** Duplicate-detection weights — logic lives in server/src/utils/duplicates.ts */
export const DUPLICATE_WEIGHTS = {
  proximity: 0.45,
  category: 0.25,
  text: 0.3,
  threshold: 0.35,
  defaultMaxDistanceM: 500,
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  pothole: "Potholes & Roads",
  garbage: "Garbage & Dumping",
  streetlight: "Streetlights",
  water_leakage: "Water & Drainage",
  sidewalk: "Sidewalks",
  infrastructure: "Infrastructure",
  other: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

export function priorityLabel(
  score: number,
): "Low" | "Medium" | "High" | "Critical" {
  if (score < 25) return "Low";
  if (score < 50) return "Medium";
  if (score < 75) return "High";
  return "Critical";
}
