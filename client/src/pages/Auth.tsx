import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Layout from "../components/Layout";
import { FieldError } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import toast from "../lib/toast";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password needs at least 8 characters").max(128),
});

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Layout>
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <div className="mt-4">{children}</div>
      </div>
    </Layout>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  return (
    <Shell title="Welcome back">
      <form
        onSubmit={handleSubmit(async (v) => {
          setServerError("");
          try {
            await login(v.email, v.password);
            toast.success("Logged in.");
            navigate("/");
          } catch (e) {
            setServerError(e instanceof ApiError ? e.message : "Login failed.");
          }
        })}
        className="space-y-3"
        aria-label="Login form"
      >
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
          />
          <FieldError message={errors.password?.message} />
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-red-700">
            {serverError}
          </p>
        )}
        <button
          disabled={isSubmitting}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-ring"
        >
          {isSubmitting ? "Logging in…" : "Login"}
        </button>
        <p className="text-center text-sm text-slate-500">
          No account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });
  return (
    <Shell title="Create your account">
      <form
        onSubmit={handleSubmit(async (v) => {
          setServerError("");
          try {
            await signup(v.name, v.email, v.password);
            toast.success("Account created.");
            navigate("/");
          } catch (e) {
            setServerError(
              e instanceof ApiError ? e.message : "Registration failed.",
            );
          }
        })}
        className="space-y-3"
        aria-label="Registration form"
      >
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Full name
          </label>
          <input
            id="name"
            autoComplete="name"
            {...register("name")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password (min 8 chars)
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-ring"
          />
          <FieldError message={errors.password?.message} />
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-red-700">
            {serverError}
          </p>
        )}
        <button
          disabled={isSubmitting}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-ring"
        >
          {isSubmitting ? "Creating…" : "Create account"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:underline"
          >
            Login
          </Link>
        </p>
      </form>
    </Shell>
  );
}
