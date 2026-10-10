// Duplicate detection — ONLY place this logic lives.
// Never auto-merges. Scores: 0.45*proximity + 0.25*category + 0.30*text.
import { DUPLICATE_WEIGHTS } from "../../../shared/constants.js";
import { haversineM, jaccard } from "./text.js";

const RELATED: Record<string, string[]> = {
  pothole: ["sidewalk", "infrastructure"],
  sidewalk: ["pothole", "infrastructure"],
  garbage: ["infrastructure"],
  streetlight: ["infrastructure"],
  water_leakage: ["infrastructure", "sidewalk"],
  infrastructure: [
    "pothole",
    "sidewalk",
    "streetlight",
    "garbage",
    "water_leakage",
  ],
  other: [],
};

export function categoryCompatibility(a: string, b: string): number {
  if (a === b) return 1;
  if ((RELATED[a] ?? []).includes(b)) return 0.5;
  return 0.2;
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  category: string;
  status: string;
  distanceM: number;
  similarity: number;
  reasons: string[];
}

export interface ScoredInput {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  coordinates: [number, number]; // [lng,lat]
}

export function scoreCandidate(
  proposal: {
    title: string;
    description: string;
    category: string;
    coordinates: [number, number];
  },
  candidate: ScoredInput,
  maxDistanceM: number = DUPLICATE_WEIGHTS.defaultMaxDistanceM,
): DuplicateCandidate | null {
  const distanceM = haversineM(proposal.coordinates, candidate.coordinates);
  if (distanceM > maxDistanceM) return null;
  const proximity = 1 - distanceM / maxDistanceM;
  const cat = categoryCompatibility(proposal.category, candidate.category);
  const text = Math.max(
    jaccard(
      `${proposal.title} ${proposal.description}`,
      `${candidate.title} ${candidate.description}`,
    ),
    0,
  );
  const w = DUPLICATE_WEIGHTS;
  const similarity =
    Math.round(
      (w.proximity * proximity + w.category * cat + w.text * text) * 1000,
    ) / 1000;
  if (similarity < w.threshold) return null;

  const reasons: string[] = [];
  reasons.push(
    distanceM < 100
      ? `Very close (${Math.round(distanceM)}m away)`
      : `Nearby (${Math.round(distanceM)}m away)`,
  );
  reasons.push(
    proposal.category === candidate.category
      ? `Same category (${candidate.category})`
      : `Related categories (${proposal.category} vs ${candidate.category})`,
  );
  if (text > 0.4) reasons.push("Very similar description");
  else if (text > 0.15) reasons.push("Similar wording in description");
  else reasons.push("Matched mainly on location + category");
  reasons.push(`Status: ${candidate.status}`);

  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    status: candidate.status,
    distanceM: Math.round(distanceM),
    similarity,
    reasons,
  };
}

export function rankCandidates(
  proposal: {
    title: string;
    description: string;
    category: string;
    coordinates: [number, number];
  },
  candidates: ScoredInput[],
  maxDistanceM: number = DUPLICATE_WEIGHTS.defaultMaxDistanceM,
  limit = 5,
): DuplicateCandidate[] {
  return candidates
    .map((c) => scoreCandidate(proposal, c, maxDistanceM))
    .filter((c): c is DuplicateCandidate => c !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
