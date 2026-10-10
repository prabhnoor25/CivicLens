import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import toast from "./toast";

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const unsub = toast.subscribe((kind, message) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4500,
      );
    });
    return unsub;
  }, []);
  return (
    <ToastCtx.Provider value={(t) => toast.show(t.kind, t.message)}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[1000] flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-red-200 bg-white text-red-800"
                : t.kind === "success"
                  ? "border-emerald-200 bg-white text-emerald-900"
                  : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
