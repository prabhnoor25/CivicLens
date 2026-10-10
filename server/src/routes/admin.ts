import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ISSUE_STATUSES } from "../../../shared/constants.js";
import { Issue, toPublicIssue } from "../models/Issue.js";
import { User } from "../models/User.js";
import { IssueEvent } from "../models/IssueEvent.js";
import { Notification } from "../models/Notification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate, requireObjectId } from "../middleware/validate.js";
import { HttpError } from "../utils/errors.js";
import { emitToAll, emitToUser } from "../socket.js";

const router = Router();
router.use(requireAuth, requireRole("moderator", "admin"));

const statusSchema = z.object({
  status: z.enum(ISSUE_STATUSES as unknown as [string, ...string[]]),
  publicNote: z.string().trim().max(1000).default(""),
  resolutionEvidenceUrls: z.array(z.string().url().max(2000)).max(5).optional(),
  rejectReason: z.string().trim().max(500).optional(),
});

const assignSchema = z.object({
  assigneeId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .nullable(),
});

const noteSchema = z
  .object({
    internalNote: z.string().trim().min(1).max(2000).optional(),
    publicNote: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.internalNote || v.publicNote, {
    message: "Provide internalNote and/or publicNote",
  });

// GET /api/admin/issues — moderation queue
router.get("/issues", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        sort: z.string().default("-priorityScore"),
        status: z.string().optional(),
        category: z.string().optional(),
        search: z.string().max(200).optional(),
        assigneeId: z.string().optional(),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    if (q.assigneeId)
      filter.assigneeId = new mongoose.Types.ObjectId(q.assigneeId);
    if (q.search) filter.$text = { $search: q.search };
    const sort: Record<string, 1 | -1> = {};
    for (const part of String(q.sort).split(",")) {
      const key = part.replace(/^-/, "");
      if (["priorityScore", "createdAt", "updatedAt"].includes(key))
        sort[key] = part.startsWith("-") ? -1 : 1;
    }
    if (!Object.keys(sort).length) sort.priorityScore = -1;
    const skip = (q.page - 1) * q.limit;
    const [items, total] = await Promise.all([
      Issue.find(filter).sort(sort).skip(skip).limit(q.limit),
      Issue.countDocuments(filter),
    ]);
    res.json({
      data: items.map((i) => toPublicIssue(i)),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/issues/:id/status
router.patch(
  "/issues/:id/status",
  requireObjectId("id"),
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const body = req.body as z.infer<typeof statusSchema>;
      if (
        body.status === "rejected" &&
        !(body.rejectReason ?? body.publicNote)
      ) {
        throw new HttpError(
          400,
          "REJECT_REASON_REQUIRED",
          "A reason is required to reject a report",
        );
      }
      const previous = issue.status;
      issue.status = body.status;
      if (body.status === "resolved") {
        issue.resolvedAt = new Date();
        if (body.resolutionEvidenceUrls)
          issue.resolutionEvidenceUrls = body.resolutionEvidenceUrls;
      } else {
        if (body.status !== "resolved") issue.resolvedAt = null;
      }
      await issue.save();
      await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: "status-changed",
        previousValue: previous,
        newValue: body.status,
        publicNote: body.publicNote || `Status changed to ${body.status}`,
        internalNote:
          body.status === "rejected" ? (body.rejectReason ?? "") : "",
      });

      const pub = toPublicIssue(issue);
      emitToAll("issue:status-changed", {
        issue: pub,
        previousValue: previous,
        newValue: body.status,
      });
      emitToAll("issue:updated", { issue: pub });

      // Persisted notification for the reporter
      if (String(issue.reporterId) !== req.user!.id) {
        const message =
          body.status === "resolved"
            ? `Good news — your report "${issue.title}" has been resolved.`
            : body.status === "rejected"
              ? `Your report "${issue.title}" was rejected. Reason: ${body.rejectReason ?? body.publicNote}`
              : `Status of your report "${issue.title}" changed to ${body.status}.`;
        const n = await Notification.create({
          recipientId: issue.reporterId,
          issueId: issue._id,
          type: "status",
          message,
        });
        emitToUser(String(issue.reporterId), "notification:created", {
          notification: n,
        });
      }
      res.json({ issue: pub });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/issues/:id/assign
router.patch(
  "/issues/:id/assign",
  requireObjectId("id"),
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const { assigneeId } = req.body as z.infer<typeof assignSchema>;
      if (assigneeId) {
        const assignee = await User.findById(assigneeId).select("role").lean();
        if (!assignee)
          throw new HttpError(400, "BAD_ASSIGNEE", "Assignee does not exist");
      }
      const previous = issue.assigneeId ? String(issue.assigneeId) : "";
      issue.assigneeId = assigneeId
        ? new mongoose.Types.ObjectId(assigneeId)
        : null;
      await issue.save();
      await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: "assigned",
        previousValue: previous,
        newValue: assigneeId ?? "",
        publicNote: "Assignment updated",
      });
      const pub = toPublicIssue(issue);
      emitToAll("issue:updated", { issue: pub });
      res.json({ issue: pub });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/issues/:id/notes — internal +/or public note
router.post(
  "/issues/:id/notes",
  requireObjectId("id"),
  validate(noteSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id).select("_id");
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const body = req.body as z.infer<typeof noteSchema>;
      const ev = await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: "note-added",
        publicNote: body.publicNote ?? "",
        internalNote: body.internalNote ?? "",
      });
      res
        .status(201)
        .json({
          event: {
            id: String(ev._id),
            publicNote: ev.publicNote,
            createdAt: ev.createdAt,
          },
        });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/analytics — aggregated from persisted data
router.get("/analytics", async (_req, res, next) => {
  try {
    const [
      statusDist,
      categoryDist,
      severityDist,
      priorityDist,
      total,
      open,
      resolved,
      avgResolution,
      overTime,
      assignees,
    ] = await Promise.all([
      Issue.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Issue.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      Issue.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
      Issue.aggregate([
        {
          $bucket: {
            groupBy: "$priorityScore",
            boundaries: [0, 25, 50, 75, 101],
            default: "unknown",
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Issue.countDocuments({}),
      Issue.countDocuments({
        status: { $in: ["open", "acknowledged", "in_progress"] },
      }),
      Issue.countDocuments({ status: "resolved" }),
      Issue.aggregate([
        { $match: { status: "resolved", resolvedAt: { $ne: null } } },
        { $project: { ms: { $subtract: ["$resolvedAt", "$createdAt"] } } },
        { $group: { _id: null, avgMs: { $avg: "$ms" } } },
      ]),
      Issue.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            reported: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      Issue.aggregate([
        { $match: { assigneeId: { $ne: null } } },
        { $group: { _id: "$assigneeId", assigned: { $sum: 1 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $project: { assigned: 1, name: { $arrayElemAt: ["$user.name", 0] } },
        },
        { $limit: 10 },
      ]),
    ]);

    // Hotspots: coarse grid bucket of rounded coordinates
    const hotspots = await Issue.aggregate([
      {
        $project: {
          lng: { $round: [{ $arrayElemAt: ["$location.coordinates", 0] }, 2] },
          lat: { $round: [{ $arrayElemAt: ["$location.coordinates", 1] }, 2] },
        },
      },
      { $group: { _id: { lng: "$lng", lat: "$lat" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const avgMs = avgResolution[0]?.avgMs ?? 0;
    res.json({
      totals: {
        total,
        open,
        resolved,
        resolutionRate: total ? Math.round((resolved / total) * 1000) / 10 : 0,
        avgResolutionHours: avgMs ? Math.round((avgMs / 3600000) * 10) / 10 : 0,
      },
      statusDistribution: statusDist,
      categoryBreakdown: categoryDist,
      severityBreakdown: severityDist,
      priorityDistribution: priorityDist,
      overTime,
      hotspots,
      teamPerformance: assignees,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
