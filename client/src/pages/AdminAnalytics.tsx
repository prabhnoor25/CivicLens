import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { apiGet } from "../lib/api";
import Layout from "../components/Layout";
import { Skeleton, ErrorState, EmptyState } from "../components/ui";
import { useAuth } from "../lib/auth";

const COLORS = [
  "#166534",
  "#10B981",
  "#0284c7",
  "#ca8a04",
  "#7c3aed",
  "#b45309",
  "#475569",
];

interface Analytics {
  totals: {
    total: number;
    open: number;
    resolved: number;
    resolutionRate: number;
    avgResolutionHours: number;
  };
  statusDistribution: Array<{ _id: string; count: number }>;
  categoryBreakdown: Array<{ _id: string; count: number }>;
  severityBreakdown: Array<{ _id: string; count: number }>;
  priorityDistribution: Array<{ _id: number; count: number }>;
  overTime: Array<{ _id: string; reported: number }>;
  hotspots: Array<{ _id: { lng: number; lat: number }; count: number }>;
  teamPerformance: Array<{ _id: string; assigned: number; name?: string }>;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { isStaff, user } = useAuth();
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<Analytics>("/api/admin/analytics"),
    enabled: isStaff,
  });

  if (!user)
    return (
      <Layout>
        <EmptyState title="Please log in" />
      </Layout>
    );
  if (!isStaff)
    return (
      <Layout>
        <EmptyState
          title="Moderators only"
          hint="Analytics require staff access."
        />
      </Layout>
    );

  if (q.isLoading) {
    return (
      <Layout>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Layout>
        <div className="mt-3">
          <ErrorState
            message="Could not load analytics."
            onRetry={() => q.refetch()}
          />
        </div>
      </Layout>
    );
  }
  const d = q.data;
  if (d.totals.total === 0) {
    return (
      <Layout>
        <div className="mt-3">
          <EmptyState
            title="No data yet"
            hint="Seed the database or wait for the first reports."
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
      <p className="text-sm text-slate-500">
        Every chart is computed live from persisted reports.
      </p>
      <>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {[
            ["Total reports", d.totals.total],
            ["Open", d.totals.open],
            ["Resolution rate", `${d.totals.resolutionRate}%`],
            ["Avg. resolution", `${d.totals.avgResolutionHours}h`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Reports over time">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={d.overTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="reported"
                  stroke="#166534"
                  strokeWidth={2}
                  dot={false}
                  name="Reported"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Category breakdown">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.categoryBreakdown} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="_id"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Status distribution (open vs resolved)">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={d.statusDistribution}
                  dataKey="count"
                  nameKey="_id"
                  outerRadius={90}
                  label
                >
                  {d.statusDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Priority distribution">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={d.priorityDistribution.map((p) => ({
                  range: `${p._id}-${p._id + 24}`,
                  count: p.count,
                }))}
              >
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#166534" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Geographic hotspots (rounded grid)">
            {d.hotspots.length === 0 ? (
              <p className="text-sm text-slate-500">
                Not enough location spread yet.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.hotspots.map((h, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-slate-600">
                      [{h._id.lat}, {h._id.lng}]
                    </span>
                    <span className="font-semibold">{h.count} report(s)</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Team workload (assigned reports)">
            {d.teamPerformance.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing assigned yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.teamPerformance.map((t) => (
                  <li key={t._id} className="flex justify-between">
                    <span className="text-slate-600">{t.name ?? t._id}</span>
                    <span className="font-semibold">{t.assigned} assigned</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </>
    </Layout>
  );
}
