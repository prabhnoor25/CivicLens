import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IComment extends Document {
  issueId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    issueId: {
      type: Schema.Types.ObjectId,
      ref: "Issue",
      required: true,
      index: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
  },
  { timestamps: true },
);

commentSchema.index({ issueId: 1, createdAt: 1 });

export const Comment =
  mongoose.models.Comment ?? mongoose.model<IComment>("Comment", commentSchema);
