// Opt-in seed: `npm run seed --prefix server`. Wipes only when SEED_RESET=true.
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
dotenv.config();
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { getEnv } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { User } from "./models/User.js";
import { Issue } from "./models/Issue.js";
import { Comment } from "./models/Comment.js";
import { IssueEvent } from "./models/IssueEvent.js";
import { computePriority } from "./utils/priority.js";
import { logger } from "./utils/logger.js";

// Demo area: Indiranagar, Bengaluru (clearly-identified demo data)
const CENTER: [number, number] = [77.6412, 12.9784];

const SAMPLES: Array<{
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  dLat: number;
  dLng: number;
  daysAgo: number;
  verifies: number;
  address: string;
}> = [
  {
    title: "Large pothole near 100 Feet Road",
    description:
      "Deep pothole spanning half the lane near the 100 Feet Road junction, dangerous for two-wheelers especially at night.",
    category: "pothole",
    severity: "high",
    status: "open",
    dLat: 0.002,
    dLng: 0.001,
    daysAgo: 2,
    verifies: 6,
    address: "100 Feet Road, Indiranagar",
  },
  {
    title: "Pothole cluster outside metro station",
    description:
      "Multiple potholes filled with rainwater outside the metro gate, auto drivers swerving into footpath.",
    category: "pothole",
    severity: "medium",
    status: "acknowledged",
    dLat: -0.001,
    dLng: 0.003,
    daysAgo: 9,
    verifies: 3,
    address: "Indiranagar Metro Gate B",
  },
  {
    title: "Garbage pile uncleared for a week",
    description:
      "Overflowing garbage pile with stray dogs scattering waste across the lane, strong smell in the mornings.",
    category: "garbage",
    severity: "high",
    status: "open",
    dLat: 0.004,
    dLng: -0.002,
    daysAgo: 6,
    verifies: 8,
    address: "12th Main, HAL 2nd Stage",
  },
  {
    title: "Illegal dumping behind park",
    description:
      "Construction debris and furniture dumped behind the neighbourhood park, blocking the walking trail.",
    category: "garbage",
    severity: "medium",
    status: "in_progress",
    dLat: -0.003,
    dLng: -0.004,
    daysAgo: 14,
    verifies: 4,
    address: "Behind Defence Colony Park",
  },
  {
    title: "Streetlight not working for 3 nights",
    description:
      "Entire stretch of streetlights dark for three consecutive nights, residents feeling unsafe walking home.",
    category: "streetlight",
    severity: "high",
    status: "open",
    dLat: 0.001,
    dLng: 0.005,
    daysAgo: 3,
    verifies: 5,
    address: "80 Feet Road, 4th Block",
  },
  {
    title: "Flickering lamp near school crossing",
    description:
      "Single lamp flickering at the school zebra crossing, hard for drivers to see children in the evening.",
    category: "streetlight",
    severity: "medium",
    status: "resolved",
    dLat: -0.005,
    dLng: 0.002,
    daysAgo: 25,
    verifies: 2,
    address: "School crossing, 6th Main",
  },
  {
    title: "Water leakage flooding footpath",
    description:
      "Pressurised water leak from underground pipe flooding the footpath and seeping into a basement shop.",
    category: "water_leakage",
    severity: "critical",
    status: "in_progress",
    dLat: 0.006,
    dLng: 0.004,
    daysAgo: 4,
    verifies: 9,
    address: "CMH Road junction",
  },
  {
    title: "Clogged storm drain before monsoon",
    description:
      "Storm drain completely clogged with plastic and silt, water stagnating after every short spell of rain.",
    category: "water_leakage",
    severity: "medium",
    status: "open",
    dLat: -0.002,
    dLng: -0.006,
    daysAgo: 11,
    verifies: 3,
    address: "KHB Colony drain",
  },
  {
    title: "Broken sidewalk slabs trip hazard",
    description:
      "Three sidewalk slabs broken and tilted after road work, elderly residents tripping regularly.",
    category: "sidewalk",
    severity: "medium",
    status: "acknowledged",
    dLat: 0.003,
    dLng: -0.005,
    daysAgo: 8,
    verifies: 4,
    address: "80 Feet Road footpath",
  },
  {
    title: "Damaged bus shelter glass",
    description:
      "Shattered glass panel at the bus shelter with sharp edges exposed at sitting height.",
    category: "infrastructure",
    severity: "high",
    status: "open",
    dLat: -0.004,
    dLng: 0.006,
    daysAgo: 5,
    verifies: 5,
    address: "Domlur bus shelter",
  },
  {
    title: "Fallen signage blocking lane",
    description:
      "Old commercial signage fallen across half the service lane after strong winds, needs removal.",
    category: "infrastructure",
    severity: "low",
    status: "resolved",
    dLat: 0.007,
    dLng: -0.001,
    daysAgo: 30,
    verifies: 1,
    address: "Service lane, 100 Feet Rd",
  },
  {
    title: "Open manhole without cover",
    description:
      "Open manhole without any cover or barricade in the middle of a residential lane, extremely dangerous after dark.",
    category: "infrastructure",
    severity: "critical",
    status: "open",
    dLat: -0.006,
    dLng: -0.003,
    daysAgo: 1,
    verifies: 11,
    address: "Residential lane, 5th Block",
  },
];

async function main() {
  const env = getEnv();
  await connectDb(env.MONGODB_URI);
  if (env.SEED_RESET) {
    if (env.NODE_ENV === "production")
      throw new Error("Refusing SEED_RESET in production");
    await Promise.all([
      Issue.deleteMany({}),
      Comment.deleteMany({}),
      IssueEvent.deleteMany({}),
      User.deleteMany({ email: /@example\.com$/ }),
    ]);
    logger.info({ msg: "seed: wiped existing demo data" });
  }

  const passwordHash = await bcrypt.hash("Demo@1234", 12);
  const users: Record<string, InstanceType<typeof User>> = {};
  for (const [name, email, role] of [
    ["Asha Citizen", "citizen@example.com", "citizen"],
    ["Ravi Moderator", "moderator@example.com", "moderator"],
    ["Admin Rao", "admin@example.com", "admin"],
  ] as const) {
    const existing = await User.findOne({ email });
    users[role] =
      existing ?? (await User.create({ name, email, passwordHash, role }));
  }

  if ((await Issue.countDocuments({})) === 0) {
    for (const s of SAMPLES) {
      const createdAt = new Date(Date.now() - s.daysAgo * 86_400_000);
      const p = computePriority({
        severity: s.severity as never,
        category: s.category as never,
        createdAt,
        verificationCount: s.verifies,
        status: s.status,
      });
      const issue = await Issue.create({
        title: s.title,
        description: s.description,
        category: s.category,
        severity: s.severity,
        status: s.status,
        priorityScore: p.score,
        priorityFactors: p.factors,
        location: {
          type: "Point",
          coordinates: [CENTER[0] + s.dLng, CENTER[1] + s.dLat],
        },
        address: s.address,
        photoUrls: [],
        reporterId: users.citizen._id,
        assigneeId: ["acknowledged", "in_progress"].includes(s.status)
          ? users.moderator._id
          : null,
        communityVerificationCount: s.verifies,
        resolvedAt:
          s.status === "resolved"
            ? new Date(createdAt.getTime() + 5 * 86_400_000)
            : null,
        createdAt,
        updatedAt: createdAt,
      });
      await IssueEvent.create({
        issueId: issue._id,
        actorId: users.citizen._id,
        eventType: "created",
        newValue: "open",
        publicNote: "Report submitted (demo seed)",
      });
      if (s.status !== "open") {
        await IssueEvent.create({
          issueId: issue._id,
          actorId: users.moderator._id,
          eventType: "status-changed",
          previousValue: "open",
          newValue: s.status,
          publicNote: `Status changed to ${s.status} (demo seed)`,
        });
      }
      await Comment.create({
        issueId: issue._id,
        authorId: users.citizen._id,
        body: "Demo seed comment: facing this daily, please prioritise.",
      });
    }
    logger.info({
      msg: `seed: created ${SAMPLES.length} demo issues near Indiranagar, Bengaluru`,
    });
  } else {
    logger.info({ msg: "seed: issues already exist, skipping issue creation" });
  }
  await disconnectDb();
  await mongoose.disconnect().catch(() => undefined);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err });
    process.exit(1);
  });
