import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck } from "lucide-react";
import { apiGet, apiPatch } from "../lib/api";
import Layout from "../components/Layout";
import { Skeleton, ErrorState, EmptyState } from "../components/ui";
import toast from "../lib/toast";
import { useSocket } from "../hooks/useSocket";

interface Notif {
  id: string;
  issueId?: string | null;
  type: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
}

export default function Notifications() {
  useSocket();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiGet<{ data: Notif[]; unread: number }>("/api/notifications?limit=50"),
  });

  const readOne = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () => toast.error("Could not mark as read."),
  });
  const readAll = useMutation({
    mutationFn: () => apiPatch("/api/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read.");
    },
    onError: () => toast.error("Could not mark all as read."),
  });

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <BellRing size={20} aria-hidden /> Notifications
        </h1>
        <button
          onClick={() => readAll.mutate()}
          disabled={readAll.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus-ring disabled:opacity-60"
        >
          <CheckCheck size={15} aria-hidden /> Mark all read
        </button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState
          message="Could not load notifications."
          onRetry={() => q.refetch()}
        />
      ) : (q.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="You're all caught up"
          hint="Status changes, comments and resolutions on your reports will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {q.data!.data.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${n.readAt ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/50"}`}
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2.5 w-2.5 rounded-full ${n.readAt ? "bg-slate-300" : "bg-emerald-500"}`}
              />
              <div className="flex-1">
                <p className="text-sm text-slate-800">{n.message}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(n.createdAt).toLocaleString()} · {n.type}
                </p>
                {n.issueId && (
                  <Link
                    to={`/issues/${n.issueId}`}
                    className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    View report
                  </Link>
                )}
              </div>
              {!n.readAt && (
                <button
                  onClick={() => readOne.mutate(n.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium focus-ring"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
