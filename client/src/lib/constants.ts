// Canonical client constants — mirrored from shared/constants.ts (read-only).
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
export type UserRole = "citizen" | "moderator" | "admin";

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

export const CATEGORY_COLORS: Record<string, string> = {
  pothole: "#b45309",
  garbage: "#047857",
  streetlight: "#ca8a04",
  water_leakage: "#0284c7",
  sidewalk: "#7c3aed",
  infrastructure: "#475569",
  other: "#64748b",
};

export function priorityLabel(
  score: number,
): "Low" | "Medium" | "High" | "Critical" {
  if (score < 25) return "Low";
  if (score < 50) return "Medium";
  if (score < 75) return "High";
  return "Critical";
}

export function priorityColor(label: string): string {
  switch (label) {
    case "Critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "High":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "Medium":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default:
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "acknowledged":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "rejected":
      return "bg-slate-200 text-slate-600 border-slate-300";
    default:
      return "bg-amber-100 text-amber-900 border-amber-200";
  }
}
