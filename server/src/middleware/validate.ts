import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { HttpError, assertNoMongoOperators } from "../utils/errors.js";

export function validate(
  schema: ZodSchema,
  source: "body" | "query" | "params" = "body",
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertNoMongoOperators(req[source], source);
      const parsed = schema.safeParse(req[source]);
      if (!parsed.success) {
        const msg = parsed.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; ");
        throw new HttpError(400, "VALIDATION_ERROR", msg || "Invalid input");
      }
      (req as unknown as Record<string, unknown>)[source] = parsed.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function isValidObjectId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

export function requireObjectId(param = "id") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = (req.params as Record<string, string>)[param];
    if (!id || !isValidObjectId(id)) {
      return next(new HttpError(400, "BAD_ID", "Invalid identifier"));
    }
    next();
  };
}
