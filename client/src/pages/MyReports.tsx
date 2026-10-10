import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import Layout from "../components/Layout";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  Skeleton,
  ErrorState,
  EmptyState,
} from "../components/ui";
import { useAuth } from "../lib/auth";
import { useSocket } from "../hooks/useSocket";

interface Issue {
  id: string;
  title: string;
  category: string;
  status: string;
  priorityScore: number;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export default function MyReports() {
  useSocket();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["issues", "mine", user?.id],
    queryFn: () =>
      apiGet<{ data: Issue[]; total: number }>(
        `/api/issues?reporterId=${user!.id}&limit=50&sort=-createdAt`,
      ),
    enabled: !!user,
  });

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-8 text-center">
          <h1 className="text-xl font-bold">Log in to see your reports</h1>
          <Link
            to="/login"
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Login
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">My reports</h1>
        <Link
          to="/report"
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          New report
        </Link>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState
          message="Could not load your reports."
          onRetry={() => q.refetch()}
        />
      ) : (q.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="You haven't reported anything yet"
          hint="Reports you submit will appear here with live status updates."
          action={
            <Link
              to="/report"
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Report your first issue
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data!.data.map((i) => (
            <li key={i.id}>
              <Link
                to={`/issues/${i.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 focus-ring"
              >
                <p className="font-semibold text-slate-900">{i.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Filed {new Date(i.createdAt).toLocaleString()} · Updated{" "}
                  {new Date(i.updatedAt).toLocaleString()}
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
    </Layout>
  );
}
