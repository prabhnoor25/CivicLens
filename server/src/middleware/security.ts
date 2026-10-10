import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { getEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts, try again later",
    },
  },
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests, slow down" },
  },
});

/** CSRF-appropriate check for cookie auth: enforce Origin/Referer allowlist on mutations. */
export function csrfOriginCheck(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const env = getEnv();
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) return next(); // same-origin non-browser clients (tests, curl) have no Origin
  try {
    const allowed = new URL(env.FRONTEND_URL).origin;
    const got = origin.startsWith("http") ? new URL(origin).origin : origin;
    if (got !== allowed) {
      logger.warn({ msg: "blocked cross-origin mutation", got, allowed });
      res
        .status(403)
        .json({ error: { code: "FORBIDDEN", message: "Origin not allowed" } });
      return;
    }
  } catch {
    res
      .status(403)
      .json({ error: { code: "FORBIDDEN", message: "Invalid origin" } });
    return;
  }
  next();
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const isHttp = err !== null && typeof err === "object" && "status" in err;
  const status = isHttp
    ? Number((err as { status: number }).status) || 500
    : 500;
  const code = isHttp
    ? String((err as { code?: string }).code ?? "INTERNAL_ERROR")
    : "INTERNAL_ERROR";
  let message = isHttp
    ? String((err as { message?: string }).message ?? "Something went wrong")
    : "Something went wrong";
  if (status === 500 && getEnv().NODE_ENV === "production")
    message = "Something went wrong";
  if (status >= 500) logger.error({ err, status, code });
  if (!res.headersSent) res.status(status).json({ error: { code, message } });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
}
