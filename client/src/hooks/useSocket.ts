import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import toast from "../lib/toast";
import { useAuth } from "../lib/auth";

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "";

export function useSocket() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("civiclens_token_fallback") ?? undefined;
    const socket = io(SOCKET_URL || undefined, {
      path: "/socket.io",
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: 10,
    });
    ref.current = socket;

    const invalidateIssues = () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    };

    socket.on("connect", () => {
      // refetch after reconnect to avoid stale state
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    socket.on("issue:created", (p: { issue?: { title?: string } }) => {
      invalidateIssues();
      toast.info(`New report: ${p.issue?.title ?? "a civic issue"}`);
    });
    socket.on("issue:updated", invalidateIssues);
    socket.on(
      "issue:status-changed",
      (p: { issue?: { title?: string }; newValue?: string }) => {
        invalidateIssues();
        qc.invalidateQueries({ queryKey: ["notifications"] });
        toast.success(
          `"${p.issue?.title ?? "Report"}" → ${p.newValue ?? "updated"}`,
        );
      },
    );
    socket.on("issue:comment-created", () => {
      qc.invalidateQueries({ queryKey: ["issue"] });
    });
    socket.on(
      "notification:created",
      (p: { notification?: { message?: string } }) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        if (p.notification?.message) toast.info(p.notification.message);
      },
    );

    return () => {
      socket.disconnect();
      ref.current = null;
    };
  }, [qc, user?.id]);

  return ref;
}
