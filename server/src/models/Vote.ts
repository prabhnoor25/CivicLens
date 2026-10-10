import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IVote extends Document {
  issueId: Types.ObjectId;
  userId: Types.ObjectId;
  type: "upvote" | "verify";
  createdAt: Date;
}

const voteSchema = new Schema<IVote>(
  {
    issueId: { type: Schema.Types.ObjectId, ref: "Issue", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["upvote", "verify"], default: "verify" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

voteSchema.index({ issueId: 1, userId: 1 }, { unique: true });
voteSchema.index({ issueId: 1 });

export const Vote =
  mongoose.models.Vote ?? mongoose.model<IVote>("Vote", voteSchema);
