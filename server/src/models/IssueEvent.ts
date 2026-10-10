import mongoose, { Schema, type Document, type Types } from "mongoose";

export type IssueEventType =
  | "created"
  | "status-changed"
  | "assigned"
  | "comment-created"
  | "verified"
  | "note-added"
  | "edited"
  | "duplicate-linked"
  | "resolved";

export interface IIssueEvent extends Document {
  issueId: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  eventType: IssueEventType;
  previousValue?: string;
  newValue?: string;
  publicNote?: string;
  internalNote?: string;
  createdAt: Date;
}

const eventSchema = new Schema<IIssueEvent>(
  {
    issueId: {
      type: Schema.Types.ObjectId,
      ref: "Issue",
      required: true,
      index: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    eventType: {
      type: String,
      enum: [
        "created",
        "status-changed",
        "assigned",
        "comment-created",
        "verified",
        "note-added",
        "edited",
        "duplicate-linked",
        "resolved",
      ],
      required: true,
    },
    previousValue: { type: String, default: "" },
    newValue: { type: String, default: "" },
    publicNote: { type: String, default: "" },
    internalNote: { type: String, default: "", select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventSchema.index({ issueId: 1, createdAt: 1 });

export function toPublicEvent(e: IIssueEvent) {
  const o = e.toObject();
  const { internalNote: _omit, ...rest } = o as unknown as Record<
    string,
    unknown
  >;
  void _omit;
  return { ...rest, id: String(o._id) };
}

export const IssueEvent =
  mongoose.models.IssueEvent ??
  mongoose.model<IIssueEvent>("IssueEvent", eventSchema);
