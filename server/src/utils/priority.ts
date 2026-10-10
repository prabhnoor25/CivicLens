import type {
  IssueCategory,
  IssueSeverity,
} from "../../../shared/constants.js";
import { PRIORITY_WEIGHTS, priorityLabel } from "../../../shared/constants.js";

export interface PriorityFactor {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  explanation: string;
}

export interface PriorityResult {
  score: number;
  label: "Low" | "Medium" | "High" | "Critical";
  factors: PriorityFactor[];
}

export interface PriorityInput {
  severity: IssueSeverity;
  category: IssueCategory;
  createdAt: Date;
  verificationCount?: number;
  status?: string;
}

/**
 * Deterministic, explainable priority heuristic (0-100).
 * Transparent demo prioritization — NOT a validated safety assessment.
 */
export function computePriority(
  input: PriorityInput,
  now = new Date(),
): PriorityResult {
  const w = PRIORITY_WEIGHTS;
  const verifyCount = Math.max(0, input.verificationCount ?? 0);
  const created =
    input.createdAt instanceof Date
      ? input.createdAt
      : new Date(input.createdAt);
  const daysOpen = Math.max(
    0,
    (now.getTime() - created.getTime()) / 86_400_000,
  );

  const severityPoints = w.severityByLevel[input.severity] ?? 10;
  const agePoints = Math.min(
    w.ageMax,
    Math.floor(daysOpen * w.agePointsPerDay),
  );
  const verifyPoints = Math.min(
    w.verificationMax,
    verifyCount * w.verificationPointsEach,
  );
  const categoryPoints = w.categoryImpact[input.category] ?? 5;

  let neglectPoints = 0;
  if (input.status !== "resolved" && input.status !== "rejected") {
    if (daysOpen > 30) neglectPoints = 10;
    else if (daysOpen > 14) neglectPoints = 5;
  }

  const raw =
    severityPoints + agePoints + verifyPoints + categoryPoints + neglectPoints;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const factors: PriorityFactor[] = [
    {
      key: "severity",
      label: "Reported severity",
      points: severityPoints,
      maxPoints: w.severityMax,
      explanation: `Reporter marked severity "${input.severity}".`,
    },
    {
      key: "age",
      label: "Time unresolved",
      points: agePoints,
      maxPoints: w.ageMax,
      explanation: `${Math.floor(daysOpen)} day(s) open; ${w.agePointsPerDay} pts/day up to ${w.ageMax}.`,
    },
    {
      key: "verification",
      label: "Community verification",
      points: verifyPoints,
      maxPoints: w.verificationMax,
      explanation: `${verifyCount} independent verification(s); ${w.verificationPointsEach} pts each up to ${w.verificationMax}.`,
    },
    {
      key: "category",
      label: "Category impact",
      points: categoryPoints,
      maxPoints: 10,
      explanation: `Category "${input.category}" has baseline impact weight ${categoryPoints}/10.`,
    },
    {
      key: "neglect",
      label: "Backlog bonus",
      points: neglectPoints,
      maxPoints: w.neglectMax,
      explanation:
        neglectPoints > 0
          ? `Open for ${Math.floor(daysOpen)} days, backlog bonus applied.`
          : "No backlog bonus (recently reported or already closed).",
    },
  ];

  return { score, label: priorityLabel(score), factors };
}
