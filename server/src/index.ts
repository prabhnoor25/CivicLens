import http from "http";
import dotenv from "dotenv";
// Load monorepo-root .env first, then server-local .env (local wins).
dotenv.config({ path: "../.env" });
dotenv.config();
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { getEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { initSocket } from "./socket.js";

async function main() {
  const env = getEnv();
  await connectDb(env.MONGODB_URI);
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  server.listen(env.PORT, () => {
    logger.info({
      msg: `CivicLens server on :${env.PORT}`,
      frontend: env.FRONTEND_URL,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info({ msg: `shutting down (${signal})` });
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err, msg: "fatal startup error" });
  process.exit(1);
});
