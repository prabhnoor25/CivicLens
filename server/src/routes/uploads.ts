import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/security.js";
import { HttpError } from "../utils/errors.js";

const router = Router();

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext =
      file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/webp"
          ? ".webp"
          : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype))
      return cb(
        new HttpError(
          400,
          "BAD_FILE",
          "Only jpeg, png, webp allowed",
        ) as unknown as Error,
      );
    cb(null, true);
  },
});

// Local fallback upload (dev/demo). Production should use Cloudinary signed uploads.
router.post(
  "/",
  requireAuth,
  writeLimiter,
  upload.array("photos", 5),
  (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const urls = files.map((f) => `/uploads/${f.filename}`);
    res.status(201).json({ urls });
  },
);

// Signed Cloudinary params — never exposes api_secret to the client.
router.post("/signature", requireAuth, (_req, res) => {
  const env = getEnv();
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    res.json({
      mode: "local",
      message:
        "Cloudinary not configured; use POST /api/uploads (local fallback).",
    });
    return;
  }
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number> = {
    timestamp,
    folder: "civiclens",
  };
  const toSign =
    Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&") + env.CLOUDINARY_API_SECRET;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");
  res.json({
    mode: "cloudinary",
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder: "civiclens",
  });
});

export default router;
