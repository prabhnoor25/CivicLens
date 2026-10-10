import { Router } from "express";
import { z } from "zod";
import { Notification } from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import { requireObjectId } from "../middleware/validate.js";
import { HttpError } from "../utils/errors.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        unreadOnly: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = { recipientId: req.user!.id };
    if (q.unreadOnly) filter.readAt = null;
    const skip = (q.page - 1) * q.limit;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(q.limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipientId: req.user!.id, readAt: null }),
    ]);
    res.json({
      data: items.map((n) => ({ ...n, id: String(n._id) })),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
      unread,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/read", requireObjectId("id"), async (req, res, next) => {
  try {
    const n = await Notification.findById(req.params.id);
    if (!n) throw new HttpError(404, "NOT_FOUND", "Notification not found");
    if (String(n.recipientId) !== req.user!.id)
      throw new HttpError(403, "FORBIDDEN", "Not your notification");
    n.readAt = new Date();
    await n.save();
    res.json({ notification: { ...n.toObject(), id: String(n._id) } });
  } catch (err) {
    next(err);
  }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user!.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
