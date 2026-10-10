import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User, toPublicUser } from "../models/User.js";
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/security.js";
import { HttpError } from "../utils/errors.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body as z.infer<
        typeof registerSchema
      >;
      const existing = await User.findOne({ email }).select("_id").lean();
      if (existing)
        throw new HttpError(
          409,
          "EMAIL_TAKEN",
          "An account with this email already exists",
        );
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: "citizen",
      });
      const token = signToken({ id: String(user._id), role: user.role });
      setAuthCookie(res, token);
      res.status(201).json({ user: toPublicUser(user), token });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      // Generic message to avoid account enumeration.
      const fail = () =>
        next(
          new HttpError(
            401,
            "INVALID_CREDENTIALS",
            "Invalid email or password",
          ),
        );
      const user = await User.findOne({ email }).select(
        "+passwordHash name email role avatarUrl createdAt",
      );
      if (!user) return fail();
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return fail();
      const token = signToken({ id: String(user._id), role: user.role });
      setAuthCookie(res, token);
      res.json({ user: toPublicUser(user), token });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
