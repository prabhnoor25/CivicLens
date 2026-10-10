import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  BadgeCheck,
  MessageSquare,
  Share2,
  Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, ApiError, photoUrl } from "../lib/api";
import { mongoToLeaflet, DEMO_CENTER } from "../lib/geo";
import { CATEGORY_LABELS, priorityLabel } from "../lib/constants";
import Layout from "../components/Layout";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  Skeleton,
  ErrorState,
} from "../components/ui";
import toast from "../lib/toast";
import { useAuth } from "../lib/auth";
import { useSocket } from "../hooks/useSocket";

interface Detail {
  issue: {
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    status: string;
    priorityScore: number;
    priorityFactors: Array<{
      key: string;
      label: string;
      points: number;
      maxPoints: number;
      explanation: string;
    }>;
    location: { coordinates: [number, number] };
    address: string;
    photoUrls: string[];
    reporterId: string;
    reporter?: { name: string };
    communityVerificationCount: number;
    resolutionEvidenceUrls: string[];
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string | null;
  };
  events: Array<{
    id: string;
    eventType: string;
    previousValue?: string;
    newValue?: string;
    publicNote?: string;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    body: string;
    authorName: string;
    authorRole: string;
    createdAt: string;
  }>;
}

export default function IssueDetail() {
  useSocket();
  const { id = "" } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    queryKey: ["issue", id],
    queryFn: () => apiGet<Detail>(`/api/issues/${id}`),
    enabled: !!id,
  });
  const dups = useQuery({
    queryKey: ["issue", id, "dups"],
    queryFn: () =>
      apiGet<{
        data: Array<{
          id: string;
          title: string;
          similarity: number;
          reasons: string[];
        }>;
      }>(`/api/issues/${id}/duplicates`),
    enabled: !!id,
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      apiPost<{ verified: boolean; count: number }>(`/api/issues/${id}/votes`, {
        type: "verify",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", id] });
      toast.success("Thanks — verification recorded.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Verification failed."),
  });

  const commentMutation = useMutation({
    mutationFn: () => apiPost(`/api/issues/${id}/comments`, { body: comment }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["issue", id] });
      toast.success("Comment posted.");
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not post comment.",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/api/issues/${id}`),
    onSuccess: () => {
      toast.success("Report deleted.");
      navigate("/my-reports");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed."),
  });

  if (q.isLoading)
    return (
      <Layout>
        <Skeleton className="h-96" />
      </Layout>
    );
  if (q.isError || !q.data)
    return (
      <Layout>
        <ErrorState
          message="Could not load this issue."
          onRetry={() => q.refetch()}
        />
      </Layout>
    );

  const { issue, events, comments } = q.data;
  const center = issue.location ? mongoToLeaflet(issue.location) : DEMO_CENTER;
  const canDelete =
    user &&
    (user.id === issue.reporterId || user.role !== "citizen") &&
    ["open"].includes(issue.status);

  return (
    <Layout>
      <Link
        to="/explore"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 focus-ring rounded"
      >
        <ArrowLeft size={15} aria-hidden /> Back to explore
      </Link>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={issue.category} />
            <StatusBadge status={issue.status} />
            <PriorityBadge score={issue.priorityScore} />
            <span className="text-xs text-slate-500">
              Severity: {issue.severity}
            </span>
            <button
              onClick={() => {
                const url = window.location.href;
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => toast.success("Link copied to clipboard."))
                  .catch(() => toast.info(url));
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium focus-ring"
            >
              <Share2 size={13} aria-hidden /> Share
            </button>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {issue.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Reported by {issue.reporter?.name ?? "a citizen"} ·{" "}
            {new Date(issue.createdAt).toLocaleString()} · Updated{" "}
            {new Date(issue.updatedAt).toLocaleString()}
            {issue.address && <> · {issue.address}</>}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {issue.description}
          </p>

          {issue.photoUrls.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {issue.photoUrls.map((u, k) => (
                <img
                  key={k}
                  src={photoUrl(u)}
                  alt={`Evidence photo ${k + 1} for ${issue.title}`}
                  className="h-28 w-28 rounded-lg border border-slate-200 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}

          <div
            className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
            aria-label="Priority explanation"
          >
            <p className="text-sm font-semibold text-slate-900">
              Priority: {priorityLabel(issue.priorityScore)} (
              {issue.priorityScore}/100)
            </p>
            <p className="text-xs text-slate-500">
              Transparent heuristic from severity, age, verification, category
              and backlog — not a safety assessment.
            </p>
            <ul className="mt-2 space-y-1.5">
              {issue.priorityFactors.map((f) => (
                <li key={f.key} className="text-xs text-slate-700">
                  <span className="font-medium">{f.label}:</span> {f.points}/
                  {f.maxPoints} — {f.explanation}
                </li>
              ))}
            </ul>
          </div>

          {issue.status === "resolved" &&
            issue.resolutionEvidenceUrls.length > 0 && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">
                  Resolution evidence
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {issue.resolutionEvidenceUrls.map((u, k) => (
                    <img
                      key={k}
                      src={photoUrl(u)}
                      alt={`Resolution evidence ${k + 1}`}
                      className="h-24 w-24 rounded-lg border object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              disabled={!user || verifyMutation.isPending}
              onClick={() =>
                user
                  ? verifyMutation.mutate()
                  : toast.info("Log in to verify reports.")
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 focus-ring"
            >
              <BadgeCheck size={16} aria-hidden /> Verify (
              {issue.communityVerificationCount})
            </button>
            <span className="text-xs text-slate-500">
              {CATEGORY_LABELS[issue.category]} ·{" "}
              {issue.communityVerificationCount} independent verification(s)
            </span>
            {canDelete &&
              (confirmDelete ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  Confirm delete?
                  <button
                    onClick={() => deleteMutation.mutate()}
                    className="rounded-lg bg-red-700 px-2.5 py-1 font-semibold text-white"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border px-2.5 py-1"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 focus-ring"
                >
                  <Trash2 size={13} aria-hidden /> Delete
                </button>
              ))}
          </div>

          <section className="mt-6" aria-label="Discussion">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <MessageSquare size={15} aria-hidden /> Discussion (
              {comments.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <p className="text-sm text-slate-800">{c.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.authorName} · {c.authorRole} ·{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
              {comments.length === 0 && (
                <li className="text-sm text-slate-500">
                  No comments yet — start the discussion.
                </li>
              )}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!user) return toast.info("Log in to comment.");
                if (!comment.trim()) return;
                commentMutation.mutate();
              }}
            >
              <label htmlFor="comment" className="sr-only">
                Add a comment
              </label>
              <input
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                placeholder={
                  user
                    ? "Add a helpful update or confirmation…"
                    : "Log in to comment"
                }
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
              />
              <button
                disabled={commentMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-ring"
              >
                Post
              </button>
            </form>
          </section>
        </article>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Location</h2>
            <div className="mt-2">
              <MapContainer
                center={center}
                zoom={15}
                style={{ height: 240, width: "100%" }}
                scrollWheelZoom={false}
                aria-label="Issue location map"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <Marker
                  position={center}
                  icon={L.divIcon({
                    className: "",
                    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:#166534;border:2px solid white"></span>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                  })}
                />
              </MapContainer>
            </div>
            {issue.address && (
              <p className="mt-2 text-xs text-slate-500">{issue.address}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Activity timeline
            </h2>
            <ol className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">
                    {e.eventType}
                  </span>
                  {e.previousValue || e.newValue ? (
                    <>
                      : {e.previousValue} → {e.newValue}
                    </>
                  ) : null}
                  {e.publicNote && (
                    <p className="text-slate-500">{e.publicNote}</p>
                  )}
                  <p className="text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-xs text-slate-500">No activity yet.</li>
              )}
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Similar nearby reports
            </h2>
            {dups.isLoading ? (
              <p className="mt-1 text-xs text-slate-500">Checking…</p>
            ) : (dups.data?.data.length ?? 0) === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                No likely duplicates found.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dups.data!.data.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-slate-100 p-2"
                  >
                    <Link
                      to={`/issues/${d.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {d.title}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      Similarity {(d.similarity * 100).toFixed(0)}% ·{" "}
                      {d.reasons.join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </Layout>
  );
}
