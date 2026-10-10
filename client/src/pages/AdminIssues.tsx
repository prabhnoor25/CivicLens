import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/api";
import { ISSUE_STATUSES, STATUS_LABELS } from "../lib/constants";
import Layout from "../components/Layout";
import {
  StatusBadge,
  PriorityBadge,
  Skeleton,
  ErrorState,
  EmptyState,
} from "../components/ui";
import toast from "../lib/toast";
import { useAuth } from "../lib/auth";
import { useSocket } from "../hooks/useSocket";

interface Issue {
  id: string;
  title: string;
  category: string;
  status: string;
  severity: string;
  priorityScore: number;
  reporterId: string;
  assigneeId?: string | null;
  address: string;
  createdAt: string;
}

export default function AdminIssues() {
  useSocket();
  const { user, isStaff } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const q = useQuery({
    queryKey: ["admin-issues", status, search],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "30", sort: "-priorityScore" });
      if (status) p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      return apiGet<{ data: Issue[]; total: number }>(`/api/admin/issues?${p}`);
    },
    enabled: isStaff,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      next,
      reason,
    }: {
      id: string;
      next: string;
      reason?: string;
    }) =>
      apiPatch<{ issue: Issue }>(`/api/admin/issues/${id}/status`, {
        status: next,
        publicNote:
          next === "rejected"
            ? `Rejected: ${reason}`
            : `Status changed to ${next} by ${user?.name}`,
        rejectReason: reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-issues"] });
      toast.success("Status updated — reporter notified.");
      setSelected(null);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Status update failed."),
  });

  const noteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiPost(`/api/admin/issues/${id}/notes`, {
        internalNote: note || undefined,
        publicNote: undefined,
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Internal note saved (citizens cannot see it).");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Could not save note."),
  });

  if (!user)
    return (
      <Layout>
        <EmptyState
          title="Please log in"
          hint="Moderation requires a staff account."
        />
      </Layout>
    );
  if (!isStaff)
    return (
      <Layout>
        <EmptyState
          title="Moderators only"
          hint="Your account does not have moderation access."
        />
      </Layout>
    );

  return (
    <Layout>
      <h1 className="text-xl font-bold text-slate-900">Moderation dashboard</h1>
      <p className="text-sm text-slate-500">
        Review reports, assign teams, change status, keep internal notes
        private.
      </p>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="text-xs text-slate-500">
          Status
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ml-1 rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="">All</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <span className="sr-only">Search reports</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-transparent text-sm outline-none"
          />
        </label>
      </form>

      {q.isLoading ? (
        <Skeleton className="mt-3 h-64" />
      ) : q.isError ? (
        <ErrorState
          message="Could not load moderation queue."
          onRetry={() => q.refetch()}
        />
      ) : (q.data?.data.length ?? 0) === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Queue is clear"
            hint="No reports match the current filters."
          />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Report</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Filed</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.data.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/issues/${i.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {i.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {i.category} · {i.severity} · {i.address}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <PriorityBadge score={i.priorityScore} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(i.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setSelected(i)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium focus-ring"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Review ${selected.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-slate-900">{selected.title}</h2>
            <div className="mt-1 flex gap-2">
              <StatusBadge status={selected.status} />
              <PriorityBadge score={selected.priorityScore} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["acknowledged", "in_progress", "resolved"] as const).map(
                (s) => (
                  <button
                    key={s}
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ id: selected.id, next: s })
                    }
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Mark {STATUS_LABELS[s]}
                  </button>
                ),
              )}
            </div>
            <div className="mt-3">
              <label
                htmlFor="reject-reason"
                className="text-xs font-medium text-slate-700"
              >
                Reject with reason (required for rejection)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Duplicate of #…, test submission…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <button
                  disabled={statusMutation.isPending || !rejectReason.trim()}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Reject "${selected.title}"? The reporter will see the reason.`,
                      )
                    )
                      return;
                    statusMutation.mutate({
                      id: selected.id,
                      next: "rejected",
                      reason: rejectReason.trim(),
                    });
                  }}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label
                htmlFor="internal-note"
                className="text-xs font-medium text-slate-700"
              >
                Internal note (staff-only, never shown to citizens)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="internal-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Contractor B roster for Thursday"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <button
                  disabled={noteMutation.isPending || !note.trim()}
                  onClick={() => noteMutation.mutate({ id: selected.id })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                >
                  Save note
                </button>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Link
                to={`/issues/${selected.id}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
              >
                Open full report
              </Link>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
