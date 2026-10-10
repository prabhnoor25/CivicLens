const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Broadcast session death so AuthProvider can drop the cached identity.
    // (Listener only clears cache — no refetch — so this cannot loop.)
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("civiclens:unauthorized"));
    }
    const err = (data.error ?? {}) as { code?: string; message?: string };
    throw new ApiError(
      res.status,
      err.code ?? "REQUEST_FAILED",
      err.message ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...bearerFallbackHeader(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  return parse<T>(res);
}

/**
 * Cookie-independent auth fallback. The server sets an HttpOnly cookie at
 * login, but if the browser blocks it (all-cookies-blocked, strict privacy
 * extensions, some in-app webviews), every follow-up request would 401 and
 * the user would be "kicked out" right after logging in. The login/register
 * responses also return the JWT body-side, which we keep in localStorage and
 * attach here — the server accepts it via `Authorization: Bearer`.
 * Cookie remains the primary mechanism; this only fills the gap.
 */
function bearerFallbackHeader(): Record<string, string> {
  try {
    const t = localStorage.getItem("civiclens_token_fallback");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
export const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
export const apiDelete = <T>(path: string) =>
  api<T>(path, { method: "DELETE" });

export async function uploadPhotos(files: File[]): Promise<string[]> {
  const form = new FormData();
  for (const f of files) form.append("photos", f);
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    urls?: string[];
    error?: { message?: string };
  };
  if (!res.ok)
    throw new ApiError(
      res.status,
      "UPLOAD_FAILED",
      data.error?.message ?? "Upload failed",
    );
  return data.urls ?? [];
}

export function photoUrl(u: string): string {
  if (!u) return "";
  if (u.startsWith("http") || u.startsWith("blob:") || u.startsWith("data:"))
    return u;
  return `${API_BASE}${u}`;
}
