import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { getEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import {
  csrfOriginCheck,
  errorHandler,
  notFound,
} from "./middleware/security.js";
import authRoutes from "./routes/auth.js";
import issueRoutes from "./routes/issues.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import uploadRoutes from "./routes/uploads.js";
import healthRoutes from "./routes/health.js";

export function createApp() {
  const env = getEnv();
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  // Request logging — never log secrets (cookies, tokens, passwords).
  app.use(
    pinoHttp({
      logger,
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization", "req.body.password"],
        censor: "[REDACTED]",
      },
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );
  app.use(csrfOriginCheck);

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.use("/api/auth", authRoutes);
  app.use("/api/issues", issueRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api", healthRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
