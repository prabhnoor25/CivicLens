import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  DUPLICATE_WEIGHTS,
} from "../../../shared/constants.js";
import { Issue, toPublicIssue, type IIssue } from "../models/Issue.js";
import { User } from "../models/User.js";
import { Comment } from "../models/Comment.js";
import { Vote } from "../models/Vote.js";
import { IssueEvent, toPublicEvent } from "../models/IssueEvent.js";
import { Notification } from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, requireObjectId } from "../middleware/validate.js";
import { writeLimiter } from "../middleware/security.js";
import { HttpError } from "../utils/errors.js";
import { computePriority } from "../utils/priority.js";
import { rankCandidates } from "../utils/duplicates.js";
import { isValidLngLat } from "../utils/text.js";
import { emitToAll, emitToUser } from "../socket.js";

const router = Router();

const locationSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});

const createIssueSchema = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(ISSUE_CATEGORIES as unknown as [string, ...string[]]),
  severity: z.enum(ISSUE_SEVERITIES as unknown as [string, ...string[]]),
  location: locationSchema,
  address: z.string().trim().max(300).default(""),
  photoUrls: z.array(z.string().url().max(2000)).max(5).default([]),
  duplicateOf: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional()
    .nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(40).default("-createdAt"),
  category: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  severity: z.string().max(40).optional(),
  search: z.string().max(200).optional(),
  reporterId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(5).max(140).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  category: z
    .enum(ISSUE_CATEGORIES as unknown as [string, ...string[]])
    .optional(),
  severity: z
    .enum(ISSUE_SEVERITIES as unknown as [string, ...string[]])
    .optional(),
  address: z.string().trim().max(300).optional(),
  photoUrls: z.array(z.string().url().max(2000)).max(5).optional(),
  duplicateOf: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .nullable()
    .optional(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const voteSchema = z.object({
  type: z.enum(["upvote", "verify"]).default("verify"),
});

function buildFilter(
  q: z.infer<typeof listQuerySchema>,
): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (
    q.category &&
    (ISSUE_CATEGORIES as readonly string[]).includes(q.category)
  )
    f.category = q.category;
  if (q.status && (ISSUE_STATUSES as readonly string[]).includes(q.status))
    f.status = q.status;
  if (
    q.severity &&
    (ISSUE_SEVERITIES as readonly string[]).includes(q.severity)
  )
    f.severity = q.severity;
  if (q.reporterId) f.reporterId = new mongoose.Types.ObjectId(q.reporterId);
  if (q.search) f.$text = { $search: q.search };
  return f;
}

function parseSort(sort: string): Record<string, 1 | -1> {
  const allowed = new Set([
    "createdAt",
    "updatedAt",
    "priorityScore",
    "communityVerificationCount",
    "title",
  ]);
  const out: Record<string, 1 | -1> = {};
  for (const part of sort.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const dir = s.startsWith("-") ? -1 : 1;
    const key = s.replace(/^-/, "");
    if (allowed.has(key)) out[key] = dir as 1 | -1;
  }
  return Object.keys(out).length ? out : { createdAt: -1 };
}

async function withNames(issues: IIssue[]) {
  const ids = new Set<string>();
  for (const i of issues) {
    ids.add(String(i.reporterId));
    if (i.assigneeId) ids.add(String(i.assigneeId));
  }
  const users = await User.find({ _id: { $in: [...ids] } })
    .select("name")
    .lean();
  const map = new Map(users.map((u) => [String(u._id), u.name]));
  return issues.map((i) =>
    toPublicIssue(i, {
      reporter: {
        id: String(i.reporterId),
        name: map.get(String(i.reporterId)) ?? "Citizen",
      },
      assignee: i.assigneeId
        ? {
            id: String(i.assigneeId),
            name: map.get(String(i.assigneeId)) ?? "Team",
          }
        : null,
    }),
  );
}

async function validateDuplicateLink(
  duplicateOf: string | null | undefined,
  selfId?: string,
) {
  if (!duplicateOf) return;
  if (selfId && duplicateOf === selfId)
    throw new HttpError(
      400,
      "BAD_DUPLICATE",
      "An issue cannot duplicate itself",
    );
  const target = await Issue.findById(duplicateOf)
    .select("_id duplicateOf")
    .lean();
  if (!target)
    throw new HttpError(400, "BAD_DUPLICATE", "Linked report does not exist");
  // cycle check: walk chain up to 10 hops
  let cursor: string | null = duplicateOf;
  const seen = new Set<string>();
  for (let hop = 0; hop < 10 && cursor; hop++) {
    if (cursor === selfId)
      throw new HttpError(400, "BAD_DUPLICATE", "Circular duplicate reference");
    if (seen.has(cursor))
      throw new HttpError(400, "BAD_DUPLICATE", "Circular duplicate reference");
    seen.add(cursor);
    const doc = (cursor === duplicateOf
      ? target
      : await Issue.findById(cursor)
          .select("duplicateOf")
          .lean()) as unknown as { duplicateOf?: unknown } | null;
    cursor = doc?.duplicateOf ? String(doc.duplicateOf) : null;
  }
}

// POST /api/issues — create
router.post(
  "/",
  requireAuth,
  writeLimiter,
  validate(createIssueSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createIssueSchema>;
      const [lng, lat] = body.location.coordinates;
      if (!isValidLngLat(lng, lat))
        throw new HttpError(400, "BAD_LOCATION", "Invalid coordinates");
      await validateDuplicateLink(body.duplicateOf ?? null);

      const priority = computePriority({
        severity: body.severity as never,
        category: body.category as never,
        createdAt: new Date(),
        verificationCount: 0,
        status: "open",
      });

      const issue = new Issue({
        title: body.title,
        description: body.description,
        category: body.category,
        severity: body.severity,
        status: "open",
        priorityScore: priority.score,
        priorityFactors: priority.factors,
        location: { type: "Point", coordinates: [lng, lat] },
        address: body.address,
        photoUrls: body.photoUrls,
        reporterId: new mongoose.Types.ObjectId(req.user!.id),
        duplicateOf: body.duplicateOf
          ? new mongoose.Types.ObjectId(body.duplicateOf)
          : null,
      });
      await issue.save();
      await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: body.duplicateOf ? "duplicate-linked" : "created",
        newValue: "open",
        publicNote: "Report submitted",
      });

      const pub = toPublicIssue(issue, {
        reporter: { id: req.user!.id, name: req.user!.name },
        assignee: null,
      });
      emitToAll("issue:created", { issue: pub });
      res.status(201).json({ issue: pub });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/issues — list with pagination/filter/sort/search
router.get("/", validate(listQuerySchema, "query"), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const filter = buildFilter(q);
    const sort = parseSort(q.sort);
    const skip = (q.page - 1) * q.limit;
    const [items, total] = await Promise.all([
      Issue.find(filter).sort(sort).skip(skip).limit(q.limit),
      Issue.countDocuments(filter),
    ]);
    const data = await withNames(items);
    res.json({
      data,
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/issues/nearby — geospatial query
router.get("/nearby", async (req, res, next) => {
  try {
    const schema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      maxDistance: z.coerce.number().int().min(50).max(20000).default(2000),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      category: z.string().optional(),
      status: z.string().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success)
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid nearby query");
    const { lat, lng, maxDistance, limit, category, status } = parsed.data;
    const filter: Record<string, unknown> = {
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: maxDistance,
        },
      },
    };
    if (category && (ISSUE_CATEGORIES as readonly string[]).includes(category))
      filter.category = category;
    if (status && (ISSUE_STATUSES as readonly string[]).includes(status))
      filter.status = status;
    const items = await Issue.find(filter).limit(limit);
    res.json({ data: await withNames(items) });
  } catch (err) {
    next(err);
  }
});

// GET /api/issues/:id/duplicates — suggestions (must be before /:id)
router.get("/:id/duplicates", requireObjectId("id"), async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
    const maxDistanceM: number = Math.min(
      5000,
      Math.max(
        100,
        Number(req.query.maxDistance ?? DUPLICATE_WEIGHTS.defaultMaxDistanceM),
      ),
    );
    const nearby = await Issue.find({
      _id: { $ne: issue._id },
      status: { $ne: "rejected" },
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: issue.location.coordinates },
          $maxDistance: maxDistanceM,
        },
      },
    }).limit(30);
    const ranked = rankCandidates(
      {
        title: issue.title,
        description: issue.description,
        category: issue.category,
        coordinates: issue.location.coordinates as [number, number],
      },
      nearby.map((n) => ({
        id: String(n._id),
        title: n.title,
        description: n.description,
        category: n.category,
        status: n.status,
        coordinates: n.location.coordinates as [number, number],
      })),
      maxDistanceM,
    );
    res.json({ data: ranked });
  } catch (err) {
    next(err);
  }
});

// GET /api/issues/:id — detail (public fields + events + comments summary)
router.get("/:id", requireObjectId("id"), async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
    const reporter = (await User.findById(issue.reporterId)
      .select("name")
      .lean()) as unknown as { name?: string } | null;
    const assignee = issue.assigneeId
      ? ((await User.findById(issue.assigneeId)
          .select("name")
          .lean()) as unknown as { name?: string } | null)
      : null;
    const modDoc = req.user
      ? ((await User.findById(req.user.id)
          .select("role")
          .lean()) as unknown as { role?: string } | null)
      : null;
    const isMod =
      !!req.user && ["moderator", "admin"].includes(modDoc?.role ?? "");
    // Refresh display priority deterministically (age changes over time)
    const refreshed = computePriority({
      severity: issue.severity as never,
      category: issue.category as never,
      createdAt: issue.createdAt,
      verificationCount: issue.communityVerificationCount,
      status: issue.status,
    });
    const pub = toPublicIssue(issue, {
      reporter: {
        id: String(issue.reporterId),
        name: reporter?.name ?? "Citizen",
      },
      assignee: assignee
        ? { id: String(issue.assigneeId), name: assignee.name ?? "Team" }
        : null,
    });
    (pub as Record<string, unknown>).priorityScore = refreshed.score;
    (pub as Record<string, unknown>).priorityFactors = refreshed.factors;

    const eventsQuery = IssueEvent.find({ issueId: issue._id })
      .sort({ createdAt: 1 })
      .limit(100);
    if (!isMod) eventsQuery.select("-internalNote");
    const events = (await eventsQuery).map(toPublicEvent);
    const comments = await Comment.find({ issueId: issue._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    const authorIds = [...new Set(comments.map((c) => String(c.authorId)))];
    const authors = await User.find({ _id: { $in: authorIds } })
      .select("name role")
      .lean();
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));
    res.json({
      issue: pub,
      events,
      comments: comments.map((c) => ({
        id: String(c._id),
        body: c.body,
        authorId: String(c.authorId),
        authorName: authorMap.get(String(c.authorId))?.name ?? "Citizen",
        authorRole: authorMap.get(String(c.authorId))?.role ?? "citizen",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/issues/:id — owner edit (allowlisted, only when open)
router.patch(
  "/:id",
  requireAuth,
  writeLimiter,
  requireObjectId("id"),
  validate(patchSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const me = (await User.findById(req.user!.id)
        .select("role")
        .lean()) as unknown as { role?: string } | null;
      const isOwner = String(issue.reporterId) === req.user!.id;
      const isStaff = !!me && ["moderator", "admin"].includes(me.role ?? "");
      if (!isOwner && !isStaff)
        throw new HttpError(
          403,
          "FORBIDDEN",
          "You can only edit your own reports",
        );
      if (!isStaff && issue.status !== "open") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only open reports can be edited by citizens",
        );
      }
      const body = req.body as Partial<z.infer<typeof patchSchema>>;
      if (body.duplicateOf !== undefined)
        await validateDuplicateLink(body.duplicateOf, String(issue._id));

      const prev = { title: issue.title };
      if (body.title !== undefined) issue.title = body.title;
      if (body.description !== undefined) issue.description = body.description;
      if (body.category !== undefined) issue.category = body.category;
      if (body.severity !== undefined) issue.severity = body.severity;
      if (body.address !== undefined) issue.address = body.address;
      if (body.photoUrls !== undefined) issue.photoUrls = body.photoUrls;
      if (body.duplicateOf !== undefined)
        issue.duplicateOf = body.duplicateOf
          ? new mongoose.Types.ObjectId(body.duplicateOf)
          : null;

      const priority = computePriority({
        severity: issue.severity as never,
        category: issue.category as never,
        createdAt: issue.createdAt,
        verificationCount: issue.communityVerificationCount,
        status: issue.status,
      });
      issue.priorityScore = priority.score;
      issue.priorityFactors = priority.factors;
      await issue.save();
      await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: body.duplicateOf ? "duplicate-linked" : "edited",
        previousValue: prev.title,
        newValue: issue.title,
        publicNote: "Report updated",
      });
      const pub = toPublicIssue(issue);
      emitToAll("issue:updated", { issue: pub });
      res.json({ issue: pub });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/issues/:id — owner delete when open, or staff
router.delete(
  "/:id",
  requireAuth,
  writeLimiter,
  requireObjectId("id"),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const me = (await User.findById(req.user!.id)
        .select("role")
        .lean()) as unknown as { role?: string } | null;
      const isOwner = String(issue.reporterId) === req.user!.id;
      const isStaff = !!me && ["moderator", "admin"].includes(me.role ?? "");
      if (!isOwner && !isStaff)
        throw new HttpError(
          403,
          "FORBIDDEN",
          "You can only delete your own reports",
        );
      if (!isStaff && issue.status !== "open")
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only open reports can be deleted",
        );
      await Issue.deleteOne({ _id: issue._id });
      await Comment.deleteMany({ issueId: issue._id });
      await Vote.deleteMany({ issueId: issue._id });
      emitToAll("issue:updated", {
        issue: { id: String(issue._id), deleted: true },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/issues/:id/votes — verify/upvote (one per user, idempotent-ish)
router.post(
  "/:id/votes",
  requireAuth,
  writeLimiter,
  requireObjectId("id"),
  validate(voteSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      if (issue.status === "rejected")
        throw new HttpError(
          400,
          "BAD_STATE",
          "Cannot verify a rejected report",
        );
      const uid = new mongoose.Types.ObjectId(req.user!.id);
      const existing = await Vote.findOne({ issueId: issue._id, userId: uid });
      if (existing) {
        // toggle off (un-verify) to keep UX honest
        await Vote.deleteOne({ _id: existing._id });
        issue.communityVerificationCount = Math.max(
          0,
          issue.communityVerificationCount - 1,
        );
        const p = computePriority({
          severity: issue.severity as never,
          category: issue.category as never,
          createdAt: issue.createdAt,
          verificationCount: issue.communityVerificationCount,
          status: issue.status,
        });
        issue.priorityScore = p.score;
        issue.priorityFactors = p.factors;
        await issue.save();
        return res.json({
          verified: false,
          count: issue.communityVerificationCount,
        });
      }
      await Vote.create({
        issueId: issue._id,
        userId: uid,
        type: req.body.type ?? "verify",
      });
      issue.communityVerificationCount += 1;
      const p = computePriority({
        severity: issue.severity as never,
        category: issue.category as never,
        createdAt: issue.createdAt,
        verificationCount: issue.communityVerificationCount,
        status: issue.status,
      });
      issue.priorityScore = p.score;
      issue.priorityFactors = p.factors;
      await issue.save();
      await IssueEvent.create({
        issueId: issue._id,
        actorId: uid,
        eventType: "verified",
        newValue: String(issue.communityVerificationCount),
        publicNote: "Community verification",
      });
      // Notify reporter (not for self-verification)
      if (String(issue.reporterId) !== req.user!.id) {
        const n = await Notification.create({
          recipientId: issue.reporterId,
          issueId: issue._id,
          type: "verified",
          message: `Your report "${issue.title}" received a community verification.`,
        });
        emitToUser(String(issue.reporterId), "notification:created", {
          notification: n,
        });
      }
      emitToAll("issue:updated", { issue: toPublicIssue(issue) });
      res
        .status(201)
        .json({ verified: true, count: issue.communityVerificationCount });
    } catch (err) {
      // duplicate key race → treat as already verified
      if ((err as { code?: number }).code === 11000) {
        return res.json({ verified: true });
      }
      next(err);
    }
  },
);

// Alias per spec: POST /:id/verify
router.post(
  "/:id/verify",
  requireAuth,
  writeLimiter,
  requireObjectId("id"),
  async (req, res, next) => {
    req.body = { type: "verify" };
    next();
  },
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const uid = new mongoose.Types.ObjectId(req.user!.id);
      const existing = await Vote.findOne({ issueId: issue._id, userId: uid });
      if (existing)
        return res.json({
          verified: true,
          count: issue.communityVerificationCount,
        });
      await Vote.create({ issueId: issue._id, userId: uid, type: "verify" });
      issue.communityVerificationCount += 1;
      const p = computePriority({
        severity: issue.severity as never,
        category: issue.category as never,
        createdAt: issue.createdAt,
        verificationCount: issue.communityVerificationCount,
        status: issue.status,
      });
      issue.priorityScore = p.score;
      issue.priorityFactors = p.factors;
      await issue.save();
      res
        .status(201)
        .json({ verified: true, count: issue.communityVerificationCount });
    } catch (err) {
      next(err);
    }
  },
);

// GET comments
router.get("/:id/comments", requireObjectId("id"), async (req, res, next) => {
  try {
    const issue = await Issue.findById(req.params.id).select("_id");
    if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
    const comments = await Comment.find({ issueId: issue._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    const authorIds = [...new Set(comments.map((c) => String(c.authorId)))];
    const authors = await User.find({ _id: { $in: authorIds } })
      .select("name role")
      .lean();
    const map = new Map(authors.map((a) => [String(a._id), a]));
    res.json({
      data: comments.map((c) => ({
        id: String(c._id),
        body: c.body,
        authorId: String(c.authorId),
        authorName: map.get(String(c.authorId))?.name ?? "Citizen",
        authorRole: map.get(String(c.authorId))?.role ?? "citizen",
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST comments
router.post(
  "/:id/comments",
  requireAuth,
  writeLimiter,
  requireObjectId("id"),
  validate(commentSchema),
  async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) throw new HttpError(404, "NOT_FOUND", "Issue not found");
      const comment = await Comment.create({
        issueId: issue._id,
        authorId: new mongoose.Types.ObjectId(req.user!.id),
        body: (req.body as { body: string }).body,
      });
      await IssueEvent.create({
        issueId: issue._id,
        actorId: new mongoose.Types.ObjectId(req.user!.id),
        eventType: "comment-created",
        publicNote: "New comment",
      });
      const payload = {
        id: String(comment._id),
        issueId: String(issue._id),
        body: comment.body,
        authorId: req.user!.id,
        authorName: req.user!.name,
        createdAt: comment.createdAt,
      };
      emitToAll("issue:comment-created", {
        issueId: String(issue._id),
        comment: payload,
      });
      if (String(issue.reporterId) !== req.user!.id) {
        const n = await Notification.create({
          recipientId: issue.reporterId,
          issueId: issue._id,
          type: "comment",
          message: `${req.user!.name} commented on your report "${issue.title}".`,
        });
        emitToUser(String(issue.reporterId), "notification:created", {
          notification: n,
        });
      }
      res.status(201).json({ comment: payload });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
