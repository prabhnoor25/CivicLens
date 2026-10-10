import { Router } from "express";
import { pingDb } from "../config/db.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const db = await pingDb();
  res.json({
    status: db ? "ok" : "degraded",
    db: db ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

export default router;
