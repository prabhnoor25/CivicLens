import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { User } from "../models/User.js";
import { HttpError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface AuthUser {
  id: string;
  role: "citizen" | "moderator" | "admin";
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const payloadSchema = z.object({
  sub: z.string(),
  role: z.enum(["citizen", "moderator", "admin"]),
});

export function signToken(user: { id: string; role: string }): string {
  const env = getEnv();
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as unknown as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): { sub: string; role: string } {
  const env = getEnv();
  const decoded = jwt.verify(token, env.JWT_SECRET);
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success)
    throw new HttpError(401, "UNAUTHENTICATED", "Invalid session");
  return parsed.data;
}

export function setAuthCookie(res: Response, token: string): void {
  const env = getEnv();
  res.cookie("civiclens_token", token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE as "lax" | "strict" | "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  const env = getEnv();
  res.clearCookie("civiclens_token", {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE as "lax" | "strict" | "none",
    path: "/",
  });
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const hasCookie = !!req.cookies?.civiclens_token;
  const header = req.headers.authorization;
  const hasBearer = !!header?.startsWith("Bearer ");
  try {
    const token =
      req.cookies?.civiclens_token ??
      (hasBearer ? (header as string).slice(7) : undefined);
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Please log in");
    const payload = verifyToken(token);
    const user = (await User.findById(payload.sub).lean()) as unknown as {
      _id: unknown;
      name: string;
      email: string;
      role?: string;
    } | null;
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Session expired");
    req.user = {
      id: String(user._id),
      role: (user.role ?? "citizen") as AuthUser["role"],
      name: user.name,
      email: user.email,
    };
    next();
  } catch (err) {
    // Diagnostic only: kind of failure + credential presence, never values.
    logger.warn({
      msg: "auth rejected",
      url: req.url,
      hasCookie,
      hasBearer,
      kind:
        err instanceof HttpError
          ? "http:" + err.message
          : (err as Error)?.name ?? "unknown",
    });
    next(
      err instanceof HttpError
        ? err
        : new HttpError(401, "UNAUTHENTICATED", "Please log in"),
    );
  }
}

export function requireRole(
  ...roles: Array<"citizen" | "moderator" | "admin">
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user)
      return next(new HttpError(401, "UNAUTHENTICATED", "Please log in"));
    // Admin inherits moderator privileges
    const effective =
      req.user.role === "admin"
        ? ["citizen", "moderator", "admin"]
        : [req.user.role];
    if (!roles.some((r) => effective.includes(r))) {
      return next(new HttpError(403, "FORBIDDEN", "Insufficient permissions"));
    }
    next();
  };
}
