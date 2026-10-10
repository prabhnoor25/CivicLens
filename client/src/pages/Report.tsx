import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  CheckCircle2,
  ImagePlus,
  LocateFixed,
  X,
} from "lucide-react";
import { apiGet, apiPost, uploadPhotos, ApiError } from "../lib/api";
import { leafletToMongo, DEMO_CENTER } from "../lib/geo";
import {
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
} from "../lib/constants";
import Layout from "../components/Layout";
import { FieldError, StatusBadge, PriorityBadge } from "../components/ui";
import toast from "../lib/toast";
import { useAuth } from "../lib/auth";

const schema = z.object({
  title: z.string().trim().min(5, "Title needs at least 5 characters").max(140),
  description: z
    .string()
    .trim()
    .min(10, "Describe the issue in at least 10 characters")
    .max(5000),
  category: z.enum(ISSUE_CATEGORIES as unknown as [string, ...string[]]),
  severity: z.enum(ISSUE_SEVERITIES as unknown as [string, ...string[]]),
  address: z.string().trim().max(300).optional().default(""),
  duplicateOf: z.string().nullable().optional(),
});
type FormValues = z.infer<typeof schema>;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function ClickPicker({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function Report() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [created, setCreated] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [descWatch, setDescWatch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { severity: "medium", category: "pothole", address: "" },
  });
  const titleVal = watch("title");
  const categoryVal = watch("category");

  const dupQuery = useQuery({
    queryKey: ["dup-suggest", titleVal, descWatch, categoryVal, pos],
    enabled: !!pos && (titleVal?.length ?? 0) >= 5 && descWatch.length >= 10,
    queryFn: async () => {
      // client-side pre-check via nearby endpoint, then server ranks on detail; here use nearby list
      const [lat, lng] = pos!;
      const r = await apiGet<{
        data: Array<{
          id: string;
          title: string;
          category: string;
          status: string;
        }>;
      }>(`/api/issues/nearby?lat=${lat}&lng=${lng}&maxDistance=500&limit=10`);
      return r.data;
    },
  });

  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!ALLOWED_MIME.has(f.type)) {
        toast.error(`"${f.name}" is not a supported image (jpeg/png/webp).`);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 5MB.`);
        continue;
      }
      next.push(f);
    }
    const merged = [...files, ...next].slice(0, 5);
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(i: number) {
    const merged = files.filter((_, k) => k !== i);
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!pos)
        throw new ApiError(
          400,
          "NO_LOCATION",
          "Please pick a location on the map.",
        );
      setUploadPct(files.length ? 10 : null);
      const urls = files.length ? await uploadPhotos(files) : [];
      setUploadPct(files.length ? 80 : null);
      const [lat, lng] = pos;
      const body = {
        ...values,
        location: leafletToMongo(lat, lng),
        photoUrls: urls.map((u) =>
          u.startsWith("http")
            ? u
            : `${window.location.protocol}//${window.location.hostname}:4000${u}`,
        ),
        duplicateOf: values.duplicateOf || null,
      };
      const r = await apiPost<{ issue: { id: string; title: string } }>(
        "/api/issues",
        body,
      );
      setUploadPct(100);
      return r.issue;
    },
    onSuccess: (issue) => {
      toast.success("Report submitted successfully.");
      setCreated(issue);
      setUploadPct(null);
    },
    onError: (e: unknown) => {
      setUploadPct(null);
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Submission failed. Please try again.",
      );
    },
  });

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Please log in to report
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            You need an account so we can notify you about resolution progress.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              to="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
            >
              Sign up
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (created) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg rounded-xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2
            size={40}
            aria-hidden
            className="mx-auto text-emerald-600"
          />
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            Report submitted
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            "{created.title}" is now visible on the map. We'll notify you on
            every status change.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              to={`/issues/${created.id}`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              View your report
            </Link>
            <button
              onClick={() => {
                setCreated(null);
                navigate("/explore");
              }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
            >
              Explore map
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold text-slate-900">Report an issue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Confirm the exact location on the map — we never assume it silently.
        </p>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          aria-label="Report an issue"
        >
          <div>
            <label
              htmlFor="title"
              className="text-sm font-medium text-slate-700"
            >
              Issue title
            </label>
            <input
              id="title"
              {...register("title")}
              placeholder="e.g. Large pothole near bus stop"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
            />
            <FieldError message={errors.title?.message} />
          </div>
          <div>
            <label
              htmlFor="description"
              className="text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              {...register("description", {
                onChange: (e) => setDescWatch(e.target.value),
              })}
              placeholder="What is wrong, where exactly, who is affected…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
            />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="category"
                className="text-sm font-medium text-slate-700"
              >
                Category
              </label>
              <select
                id="category"
                {...register("category")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
              >
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <FieldError message={errors.category?.message} />
            </div>
            <div>
              <label
                htmlFor="severity"
                className="text-sm font-medium text-slate-700"
              >
                Severity
              </label>
              <select
                id="severity"
                {...register("severity")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
              >
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <FieldError message={errors.severity?.message} />
            </div>
          </div>
          <div>
            <label
              htmlFor="address"
              className="text-sm font-medium text-slate-700"
            >
              Landmark / address (optional)
            </label>
            <input
              id="address"
              {...register("address")}
              placeholder="e.g. Opposite petrol bunk, 80 Feet Road"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
            />
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700" id="map-label">
              Pick the exact location
            </span>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  navigator.geolocation?.getCurrentPosition(
                    (p) => setPos([p.coords.latitude, p.coords.longitude]),
                    () =>
                      toast.error(
                        "Could not get your location. Click the map instead.",
                      ),
                    { timeout: 8000 },
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium focus-ring"
              >
                <LocateFixed size={13} aria-hidden /> Use my location
              </button>
              {pos && (
                <span className="text-xs text-slate-500 self-center">
                  Selected: {pos[0].toFixed(5)}, {pos[1].toFixed(5)} — click map
                  to adjust
                </span>
              )}
            </div>
            <div
              className="mt-2"
              role="application"
              aria-labelledby="map-label"
            >
              <MapContainer
                center={pos ?? DEMO_CENTER}
                zoom={15}
                style={{ height: 300, width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <ClickPicker onPick={(lat, lng) => setPos([lat, lng])} />
                {pos && (
                  <Marker
                    position={pos}
                    icon={L.divIcon({
                      className: "",
                      html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#166534;border:3px solid white;box-shadow:0 1px 6px rgba(0,0,0,.4)"></span>`,
                      iconSize: [22, 22],
                      iconAnchor: [11, 11],
                    })}
                  />
                )}
              </MapContainer>
            </div>
            {!pos && (
              <p className="mt-1 text-xs text-amber-700">
                Location required — click the map to place your report.
              </p>
            )}
          </div>

          {dupQuery.data && dupQuery.data.length > 0 && (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3"
              role="note"
              aria-label="Possible duplicates"
            >
              <p className="text-xs font-semibold text-amber-900">
                Possible existing reports nearby — check before submitting:
              </p>
              <ul className="mt-1 space-y-1">
                {dupQuery.data.slice(0, 4).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <Link
                      to={`/issues/${d.id}`}
                      target="_blank"
                      className="font-medium text-primary hover:underline"
                    >
                      {d.title} ({d.status})
                    </Link>
                    <button
                      type="button"
                      onClick={() => setValue("duplicateOf", d.id)}
                      className="rounded-md border border-amber-300 px-2 py-0.5 font-semibold text-amber-900"
                    >
                      Link as duplicate
                    </button>
                  </li>
                ))}
              </ul>
              <input type="hidden" {...register("duplicateOf")} />
            </div>
          )}

          <div>
            <span className="text-sm font-medium text-slate-700">
              Photos (up to 5, jpeg/png/webp, 5MB each)
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {previews.map((u, i) => (
                <div
                  key={i}
                  className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200"
                >
                  <img
                    src={u}
                    alt={`Attachment ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-white p-0.5 shadow focus-ring"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
              {files.length < 5 && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 focus-ring"
                >
                  <ImagePlus size={18} aria-hidden />
                  <span className="text-[11px]">Add photo</span>
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              aria-label="Attach photos"
              onChange={(e) => addFiles(e.target.files)}
            />
            {uploadPct !== null && (
              <div className="mt-2" role="status" aria-label="Upload progress">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Uploading… {uploadPct}%
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="w-full rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 focus-ring"
          >
            {mutation.isPending || isSubmitting
              ? "Submitting…"
              : "Submit report"}
          </button>
          <p className="text-xs text-slate-400">
            Double-submit protection is on — the button disables while
            submitting.
          </p>
        </form>

        <div className="mt-4 hidden items-center gap-2" aria-hidden>
          <StatusBadge status="open" />
          <PriorityBadge score={42} />
        </div>
      </div>
    </Layout>
  );
}
