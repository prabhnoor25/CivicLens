import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "citizen" | "moderator" | "admin";
}

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isStaff: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("civiclens_token_fallback"),
  );
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<{ user: SessionUser }>("/api/auth/me"),
    retry: false,
  });

  // Any 401 anywhere means the session is dead: drop the cached identity
  // immediately (no refetch here, so this cannot loop).
  useEffect(() => {
    const onUnauthorized = () => {
      qc.setQueryData(["me"], undefined);
    };
    window.addEventListener("civiclens:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("civiclens:unauthorized", onUnauthorized);
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await apiPost<{ user: SessionUser; token: string }>(
        "/api/auth/login",
        { email, password },
      );
      if (r.token) {
        localStorage.setItem("civiclens_token_fallback", r.token);
        setToken(r.token);
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    [qc],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const r = await apiPost<{ user: SessionUser; token: string }>(
        "/api/auth/register",
        { name, email, password },
      );
      if (r.token) {
        localStorage.setItem("civiclens_token_fallback", r.token);
        setToken(r.token);
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await apiPost("/api/auth/logout").catch(() => undefined);
    localStorage.removeItem("civiclens_token_fallback");
    setToken(null);
    // Drop the cached identity synchronously so the UI flips instantly,
    // then refetch to confirm the session is gone server-side.
    qc.removeQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  // NOTE: TanStack Query retains last-successful `data` when a refetch fails,
  // so `data` alone cannot drive auth state — an error (e.g. 401 after logout
  // or an expired session) must win, otherwise the UI gets stuck "logged in"
  // while every request fails.
  const sessionUser = meQuery.isError ? null : (meQuery.data?.user ?? null);

  const value = useMemo<AuthCtx>(
    () => ({
      user: sessionUser,
      loading: meQuery.isLoading,
      login,
      register,
      logout,
      isStaff: sessionUser?.role === "moderator" || sessionUser?.role === "admin",
    }),
    [sessionUser, meQuery.isLoading, login, register, logout],
  );

  void token;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
