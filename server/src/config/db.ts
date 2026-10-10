import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

export async function connectDb(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info({ msg: "mongodb connected" });
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export async function pingDb(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    const admin = mongoose.connection.db?.admin();
    if (!admin) return false;
    await admin.ping();
    return true;
  } catch {
    return false;
  }
}
