import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast-context";
import Dashboard from "./pages/Dashboard";
import Explore from "./pages/Explore";
import Report from "./pages/Report";
import IssueDetail from "./pages/IssueDetail";
import MyReports from "./pages/MyReports";
import Notifications from "./pages/Notifications";
import AdminIssues from "./pages/AdminIssues";
import AdminAnalytics from "./pages/AdminAnalytics";
import { Login, Register } from "./pages/Auth";
import type { ReactNode } from "react";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading, isStaff } = useAuth();
  if (loading)
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/report" element={<Report />} />
              <Route path="/issues/:id" element={<IssueDetail />} />
              <Route
                path="/my-reports"
                element={
                  <RequireAuth>
                    <MyReports />
                  </RequireAuth>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <Notifications />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/issues"
                element={
                  <RequireStaff>
                    <AdminIssues />
                  </RequireStaff>
                }
              />
              <Route
                path="/admin/analytics"
                element={
                  <RequireStaff>
                    <AdminAnalytics />
                  </RequireStaff>
                }
              />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
