# CivicLens

CivicLens is a full-stack civic issue reporting and resolution platform that connects citizens with the teams responsible for maintaining their communities. Citizens report potholes, garbage accumulation, broken streetlights, water leakage, damaged sidewalks, and other public infrastructure problems on a live map — then track every report from submission to resolution while moderators triage, assign, and resolve through a dedicated queue with analytics.

Seeded demo data covers Indiranagar, Bengaluru. Priority scores are a transparent, explainable heuristic — not a safety assessment.

## Features

- **Overview dashboard** — live totals, open/resolved counts, category breakdown, status distribution, high-priority list, recent activity, and a map preview, all computed from backend data.
- **Explore map** — interactive Leaflet/OpenStreetMap view with category-colored markers, popups, map/list toggle, search, category/status/severity filters, "near me" geolocation, nearby-issue queries, and pagination.
- **Guided reporting** — validated multi-field form with map-based location picking (never assumed silently), photo attachments with previews (5 MB, jpeg/png/webp), duplicate suggestions before submit, double-submit protection, and a confirmation screen.
- **Issue details** — priority-score breakdown per factor, location map, photos, reporter info, comments, community verification voting, activity timeline, similar nearby reports, resolution evidence, share-link, and owner delete (open reports only).
- **My reports & notifications** — personal report history plus persisted notifications for status changes, comments, and verifications, with unread indicators and mark-as-read.
- **Moderation dashboard** (moderator/admin) — filterable queue, assignment, status transitions with audit history, staff-only internal notes, duplicate review, and rejection with a required reason.
- **Analytics dashboard** — reports over time, resolution rate, average resolution time, category/priority distributions, geographic hotspots, and team workload, all aggregated live from MongoDB.
- **Transparent intelligence** — deterministic 0–100 priority scoring with per-factor explanations, and geospatial duplicate detection (`$near` + category + text similarity) that suggests but never auto-merges.
- **Realtime** — Socket.IO events for new issues, status changes, comments, and notifications; the app stays fully usable offline.
- **Security** — bcrypt password hashing, JWT in HttpOnly cookies (+ Bearer fallback), server-side role/ownership checks on every protected endpoint, Zod validation, rate limiting, CSRF origin checks, and centralized safe error responses.

## Technologies used

| Layer    | Stack                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| Frontend | React 18, Vite 5, TypeScript (strict), Tailwind CSS, React Router 6, TanStack Query 5, React Hook Form + Zod, Leaflet + OpenStreetMap, Recharts, lucide-react, socket.io-client |
| Backend  | Node.js, Express 4, TypeScript, Mongoose 8, Socket.IO 4, Zod, bcryptjs, JWT (HttpOnly cookie), pino logging |
| Database | MongoDB (local or Atlas) with `2dsphere`, compound-unique, and text indexes                     |

## Setup and installation

Prerequisites: Node.js 20+, npm, and MongoDB (local or Atlas).

```bash
git clone <your-repo-url> && cd CivicLens
cp .env.example .env
# edit .env and set JWT_SECRET to 32+ random chars:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
npm run install:all
```

Optional demo content (12 reports + citizen/moderator/admin accounts, opt-in, never runs in production):

```bash
npm run seed --prefix server
```

Demo logins: `citizen@example.com`, `moderator@example.com`, `admin@example.com` — password `Demo@1234` for all three.

## How to run the application

```bash
npm run dev          # API :4000 + app :5173 (open http://localhost:5173)
npm run build        # production builds (server tsc + client tsc + vite)
npm run typecheck    # strict typecheck, both sides
```

API health: `GET http://localhost:4000/api/health` → `{"status":"ok","db":"connected"}`.

Key environment variables (`JWT_SECRET` required except in tests): `MONGODB_URI`, `PORT`, `FRONTEND_URL`, `NODE_ENV`, `JWT_EXPIRES_IN`, `COOKIE_SECURE`/`COOKIE_SAMESITE` (`true`/`none` behind HTTPS in production), `CLOUDINARY_*` (optional; unset = local `/uploads` fallback).

## Code0 / Kiro disclosure

This project was built with **Code0 within VS Code**.

## AI Development Experience

I was responsible for this project end to end — scope, architecture decisions, reviewing every change, and verifying behavior in the browser and API. I used the AI coding assistant only where it saved real effort: scaffolding boilerplate, drafting routes/models/pages, and diagnosing errors from actual output. Nothing was accepted on faith — every change was executed and verified locally (typecheck, dev servers, seeded smoke test, production builds) before keeping it.

Specific tasks where I used the AI tool:

1. **API creation** — generated the modular Express layer (auth with JWT-cookie sessions, issue CRUD with geospatial queries, moderation endpoints, notifications, uploads), including Zod validation schemas and role/ownership middleware.
2. **Database integration** — designed the six Mongoose models with timestamps, validation, and indexes (`2dsphere`, vote-uniqueness, text search), plus the opt-in seed script with analytics-friendly historical data.
3. **Component development** — built all 10 frontend pages (dashboard, Leaflet explore map, report wizard with photo previews, issue detail with priority breakdown, moderation queue, Recharts analytics) wired to TanStack Query with loading/empty/error states.
4. **Debugging** — traced real failures to root causes and fixed them: tsx failing to resolve shared-module imports, `"false"` env strings coercing to `true` (which wrongly wiped the DB and forced Secure cookies), and a stale TanStack Query cache that left users stuck "logged in" after logout.
