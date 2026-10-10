import mongoose, { Schema, type Document } from "mongoose";
import type { UserRole } from "../../../shared/constants.js";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"],
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["citizen", "moderator", "admin"],
      default: "citizen",
    },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export function toPublicUser(u: Partial<IUser> & { _id?: unknown }) {
  return {
    id: String(u._id ?? u.id ?? ""),
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl ?? "",
    createdAt: u.createdAt,
  };
}

export const User =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
