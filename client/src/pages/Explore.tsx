import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Search } from "lucide-react";
import { apiGet } from "../lib/api";
import { mongoToLeaflet, DEMO_CENTER } from "../lib/geo";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  ISSUE_SEVERITIES,
} from "../lib/constants";
import Layout from "../components/Layout";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  Skeleton,
  ErrorState,
  EmptyState,
} from "../components/ui";
import { useSocket } from "../hooks/useSocket";

interface Issue {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  severity: string;
  priorityScore: number;
  address: string;
  location: { coordinates: [number, number] };
  createdAt: string;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 14);
  return null;
}

function dot(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function Explore() {
  useSocket();
  const [view, setView] = useState<"map" | "list">("map");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [center, setCenter] = useState<[number, number]>(DEMO_CENTER);
  const [locating, setLocating] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      limit: "30",
      sort: "-createdAt",
    });
    if (category) p.set("category", category);
    if (status) p.set("status", status);
    if (severity) p.set("severity", severity);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [page, category, status, severity, search]);

  const q = useQuery({
    queryKey: ["issues", query],
    queryFn: () =>
      apiGet<{ data: Issue[]; total: number; totalPages: number }>(
        `/api/issues?${query}`,
      ),
  });

  const items = q.data?.data ?? [];

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }

  return (
    <Layout>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Explore issues</h1>
          <div
            className="ml-auto flex rounded-lg border border-slate-200 bg-white p-0.5"
            role="tablist"
            aria-label="View mode"
          >
            {(["map", "list"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize focus-ring ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <form
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
        >
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Search size={16} aria-hidden className="text-slate-400" />
            <span className="sr-only">Search issues</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by description or title…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-slate-500">
              Category
              <select
                aria-label="Filter by category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                className="ml-1 rounded-lg border border-slate-200 px-2 py-2 text-sm focus-ring"
              >
                <option value="">All</option>
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Status
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="ml-1 rounded-lg border border-slate-200 px-2 py-2 text-sm focus-ring"
              >
                <option value="">All</option>
                {ISSUE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Severity
              <select
                aria-label="Filter by severity"
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value);
                  setPage(1);
                }}
                className="ml-1 rounded-lg border border-slate-200 px-2 py-2 text-sm focus-ring"
              >
                <option value="">All</option>
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-ring disabled:opacity-50"
            >
              <LocateFixed size={15} aria-hidden />{" "}
              {locating ? "Locating…" : "Near me"}
            </button>
          </div>
        </form>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState
          message="Could not load issues."
          onRetry={() => q.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No issues match these filters"
          hint="Try widening the search or clearing filters."
        />
      ) : view === "map" ? (
        <>
          <MapContainer
            center={center}
            zoom={14}
            style={{ height: 480, width: "100%" }}
            aria-label="Interactive map of civic issues"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <Recenter center={center} />
            {items.map((i) => (
              <Marker
                key={i.id}
                position={mongoToLeaflet(i.location)}
                icon={dot(CATEGORY_COLORS[i.category] ?? "#64748b")}
              >
                <Popup>
                  <div className="w-52">
                    <Link
                      to={`/issues/${i.id}`}
                      className="font-semibold text-primary"
                    >
                      {i.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {i.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge status={i.status} />
                      <PriorityBadge score={i.priorityScore} />
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((i) => (
              <li key={i.id}>
                <Link
                  to={`/issues/${i.id}`}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 focus-ring"
                >
                  <p className="font-semibold text-slate-900">{i.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {i.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <CategoryBadge category={i.category} />
                    <StatusBadge status={i.status} />
                    <PriorityBadge score={i.priorityScore} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                to={`/issues/${i.id}`}
                className="block h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 focus-ring"
              >
                <p className="font-semibold text-slate-900">{i.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {i.description}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {i.address} · {new Date(i.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <CategoryBadge category={i.category} />
                  <StatusBadge status={i.status} />
                  <PriorityBadge score={i.priorityScore} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(q.data?.totalPages ?? 0) > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50 focus-ring"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600" aria-live="polite">
            Page {page} of {q.data?.totalPages} ({q.data?.total} reports)
          </span>
          <button
            disabled={page >= (q.data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50 focus-ring"
          >
            Next
          </button>
        </div>
      )}
    </Layout>
  );
}
