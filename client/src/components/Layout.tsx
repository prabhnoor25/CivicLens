import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Map,
  BarChart3,
  ShieldCheck,
  ClipboardList,
  Eye,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { apiGet } from "../lib/api";

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring ${
    isActive
      ? "bg-primary text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();
  const { data: notif } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => apiGet<{ unread: number }>("/api/notifications?limit=1"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 focus-ring rounded-lg"
            aria-label="CivicLens home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <Eye size={20} aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              CivicLens
            </span>
          </Link>
          <nav
            className="ml-4 hidden items-center gap-1 md:flex"
            aria-label="Primary"
          >
            <NavLink to="/" className={navClass}>
              <LayoutDashboard size={16} aria-hidden /> Dashboard
            </NavLink>
            <NavLink to="/explore" className={navClass}>
              <Map size={16} aria-hidden /> Explore
            </NavLink>
            <NavLink to="/report" className={navClass}>
              <FilePlus2 size={16} aria-hidden /> Report
            </NavLink>
            {user && (
              <NavLink to="/my-reports" className={navClass}>
                <ClipboardList size={16} aria-hidden /> My Reports
              </NavLink>
            )}
            {isStaff && (
              <NavLink to="/admin/issues" className={navClass}>
                <ShieldCheck size={16} aria-hidden /> Moderate
              </NavLink>
            )}
            {isStaff && (
              <NavLink to="/admin/analytics" className={navClass}>
                <BarChart3 size={16} aria-hidden /> Analytics
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/notifications"
                  className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-ring"
                  aria-label={`Notifications${notif?.unread ? `, ${notif.unread} unread` : ""}`}
                >
                  <Bell size={20} aria-hidden />
                  {(notif?.unread ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                      {notif!.unread > 9 ? "9+" : notif!.unread}
                    </span>
                  )}
                </Link>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {user.name} · {user.role}
                </span>
                <button
                  onClick={() => logout().then(() => navigate("/"))}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-ring"
                >
                  <LogOut size={15} aria-hidden /> Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-ring"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark focus-ring"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
          aria-label="Primary mobile"
        >
          <NavLink to="/" className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/explore" className={navClass}>
            Explore
          </NavLink>
          <NavLink to="/report" className={navClass}>
            Report
          </NavLink>
          {user && (
            <NavLink to="/my-reports" className={navClass}>
              My Reports
            </NavLink>
          )}
          {isStaff && (
            <NavLink to="/admin/issues" className={navClass}>
              Moderate
            </NavLink>
          )}
          {isStaff && (
            <NavLink to="/admin/analytics" className={navClass}>
              Analytics
            </NavLink>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        CivicLens demo · Seed data is illustrative (Indiranagar, Bengaluru) ·
        Priority scores are a transparent heuristic, not a safety assessment.
      </footer>
    </div>
  );
}
