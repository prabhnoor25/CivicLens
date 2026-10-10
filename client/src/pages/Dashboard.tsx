import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Plus,
} from "lucide-react";
import { apiGet } from "../lib/api";
import { mongoToLeaflet, DEMO_CENTER } from "../lib/geo";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "../lib/constants";
import Layout from "../components/Layout";
import {
  StatusBadge,
  PriorityBadge,
  Skeleton,
  ErrorState,
  EmptyState,
} from "../components/ui";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../lib/auth";

interface Issue {
  id: string;
  title: string;
  category: string;
  status: string;
  severity: string;
  priorityScore: number;
  address: string;
  location: { coordinates: [number, number] };
  createdAt: string;
}

function dot(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function Dashboard() {
  useSocket();
  const { user } = useAuth();
  const issuesQ = useQuery({
    queryKey: ["issues", "dashboard"],
    queryFn: () =>
      apiGet<{ data: Issue[]; total: number }>(
        "/api/issues?limit=20&sort=-priorityScore",
      ),
  });

  const total = issuesQ.data?.total ?? 0;
  const items = issuesQ.data?.data ?? [];
  const open = items.filter((i) =>
    ["open", "acknowledged", "in_progress"].includes(i.status),
  ).length;
  const resolvedCount = items.filter((i) => i.status === "resolved").length;
  const byCategory = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const i of items) {
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
    byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
  }
  const highPriority = [...items]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);
  const recent = [...items].slice(0, 5);

  return (
    <Layout>
      <section className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user
              ? `Welcome back, ${user.name.split(" ")[0]}`
              : "See what's happening in your neighbourhood"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Report potholes, garbage, broken lights and leaks — track every fix
            from report to resolution.
          </p>
        </div>
        <Link
          to="/report"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark focus-ring"
        >
          <Plus size={16} aria-hidden /> Report an issue
        </Link>
      </section>

      {issuesQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-24" />
          ))}
        </div>
      ) : issuesQ.isError ? (
        <ErrorState
          message="Could not load dashboard metrics."
          onRetry={() => issuesQ.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No reports yet"
          hint="Be the first to report a civic issue in your area."
          action={
            <Link
              to="/report"
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Report an issue
            </Link>
          }
        />
      ) : (
        <>
          <div
            className="grid gap-4 sm:grid-cols-4"
            role="region"
            aria-label="Key metrics"
          >
            {[
              {
                label: "Total reported",
                value: total,
                icon: <ClipboardList size={18} aria-hidden />,
              },
              {
                label: "Open issues",
                value: open,
                icon: <AlertTriangle size={18} aria-hidden />,
              },
              {
                label: "Resolved",
                value: resolvedCount,
                icon: <CheckCircle2 size={18} aria-hidden />,
              },
              {
                label: "Categories active",
                value: byCategory.size,
                icon: <MapPin size={18} aria-hidden />,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 text-slate-500">
                  {s.icon}
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {s.label}
                  </span>
                </div>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Map preview
                </h2>
                <Link
                  to="/explore"
                  className="text-sm font-medium text-primary hover:underline focus-ring rounded"
                >
                  Open full map
                </Link>
              </div>
              <MapContainer
                center={DEMO_CENTER}
                zoom={14}
                style={{ height: 320, width: "100%" }}
                scrollWheelZoom={false}
                aria-label="Map preview of reported issues"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                {items.slice(0, 30).map((i) => (
                  <Marker
                    key={i.id}
                    position={mongoToLeaflet(i.location)}
                    icon={dot(CATEGORY_COLORS[i.category] ?? "#64748b")}
                  >
                    <Popup>
                      <Link
                        to={`/issues/${i.id}`}
                        className="font-semibold text-primary"
                      >
                        {i.title}
                      </Link>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                High-priority issues
              </h2>
              <ul className="mt-2 space-y-2">
                {highPriority.map((i) => (
                  <li key={i.id}>
                    <Link
                      to={`/issues/${i.id}`}
                      className="block rounded-lg border border-slate-100 p-2 hover:border-slate-300 focus-ring"
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {i.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <PriorityBadge score={i.priorityScore} />
                        <StatusBadge status={i.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Category breakdown
              </h2>
              <ul className="mt-2 space-y-1.5">
                {[...byCategory.entries()].map(([c, n]) => (
                  <li
                    key={c}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-slate-700">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: CATEGORY_COLORS[c] }}
                      />
                      {CATEGORY_LABELS[c] ?? c}
                    </span>
                    <span className="font-semibold text-slate-900">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Status distribution
              </h2>
              <ul className="mt-2 space-y-1.5">
                {[...byStatus.entries()].map(([s, n]) => (
                  <li
                    key={s}
                    className="flex items-center justify-between text-sm"
                  >
                    <StatusBadge status={s} />
                    <span className="font-semibold text-slate-900">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Recent activity
              </h2>
              <ul className="mt-2 space-y-2">
                {recent.map((i) => (
                  <li key={i.id} className="text-sm">
                    <Link
                      to={`/issues/${i.id}`}
                      className="font-medium text-primary hover:underline focus-ring rounded"
                    >
                      {i.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {new Date(i.createdAt).toLocaleString()} ·{" "}
                      {i.address || CATEGORY_LABELS[i.category]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
