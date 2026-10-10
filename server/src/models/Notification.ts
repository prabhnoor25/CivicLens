import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface INotification extends Document {
  recipientId: Types.ObjectId;
  issueId?: Types.ObjectId | null;
  type: string;
  message: string;
  readAt?: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    issueId: { type: Schema.Types.ObjectId, ref: "Issue", default: null },
    type: { type: String, required: true },
    message: { type: String, required: true, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification ??
  mongoose.model<INotification>("Notification", notificationSchema);
