import mongoose, { Schema, type Document, type Types } from "mongoose";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
} from "../../../shared/constants.js";
import type { PriorityFactor } from "../utils/priority.js";

export interface IIssue extends Document {
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  priorityScore: number;
  priorityFactors: PriorityFactor[];
  location: { type: "Point"; coordinates: [number, number] };
  address: string;
  photoUrls: string[];
  reporterId: Types.ObjectId;
  assigneeId?: Types.ObjectId | null;
  duplicateOf?: Types.ObjectId | null;
  communityVerificationCount: number;
  resolutionEvidenceUrls: string[];
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: [(v: number[]) => v.length === 2, "Point needs [lng,lat]"],
    },
  },
  { _id: false },
);

const issueSchema = new Schema<IIssue>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 140,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 5000,
    },
    category: {
      type: String,
      enum: ISSUE_CATEGORIES as unknown as string[],
      required: true,
    },
    severity: {
      type: String,
      enum: ISSUE_SEVERITIES as unknown as string[],
      required: true,
    },
    status: {
      type: String,
      enum: ISSUE_STATUSES as unknown as string[],
      default: "open",
      index: true,
    },
    priorityScore: { type: Number, default: 0, index: true },
    priorityFactors: {
      type: [
        {
          key: { type: String, default: "" },
          label: { type: String, default: "" },
          points: { type: Number, default: 0 },
          maxPoints: { type: Number, default: 0 },
          explanation: { type: String, default: "" },
        },
      ],
      default: [],
    },
    location: { type: pointSchema, required: true, index: "2dsphere" },
    address: { type: String, default: "", maxlength: 300 },
    photoUrls: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 5, "Max 5 photos"],
    },
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    duplicateOf: { type: Schema.Types.ObjectId, ref: "Issue", default: null },
    communityVerificationCount: { type: Number, default: 0, min: 0 },
    resolutionEvidenceUrls: { type: [String], default: [] },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

issueSchema.index({ location: "2dsphere" });
issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ category: 1, status: 1 });
issueSchema.index({ reporterId: 1, createdAt: -1 });
issueSchema.index({ priorityScore: -1 });
issueSchema.index({ title: "text", description: "text" });

export interface PublicIssueInput
  extends Omit<Partial<IIssue>, "reporterId" | "assigneeId"> {
  _id?: unknown;
  id?: string;
  reporter?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
}

/** Strip internal fields; internalNote never stored on Issue. */
export function toPublicIssue(
  doc: IIssue,
  opts?: {
    reporter?: { id: string; name: string } | null;
    assignee?: { id: string; name: string } | null;
  },
) {
  const o = doc.toObject
    ? doc.toObject()
    : (doc as unknown as Record<string, unknown>);
  const rec = o as unknown as IIssue & { _id: unknown };
  return {
    id: String((rec as unknown as { _id: unknown })._id),
    title: rec.title,
    description: rec.description,
    category: rec.category,
    severity: rec.severity,
    status: rec.status,
    priorityScore: rec.priorityScore,
    priorityFactors: rec.priorityFactors ?? [],
    location: rec.location,
    address: rec.address,
    photoUrls: rec.photoUrls ?? [],
    reporterId: String(rec.reporterId),
    reporter: opts?.reporter ?? undefined,
    assigneeId: rec.assigneeId ? String(rec.assigneeId) : null,
    assignee: opts?.assignee ?? undefined,
    duplicateOf: rec.duplicateOf ? String(rec.duplicateOf) : null,
    communityVerificationCount: rec.communityVerificationCount ?? 0,
    resolutionEvidenceUrls: rec.resolutionEvidenceUrls ?? [],
    resolvedAt: rec.resolvedAt ?? null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export const Issue =
  mongoose.models.Issue ?? mongoose.model<IIssue>("Issue", issueSchema);
