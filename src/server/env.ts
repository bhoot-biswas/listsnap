import "server-only";
import path from "node:path";

/**
 * The only module that reads process.env. Nothing here throws at import:
 * Google, SMTP and live AI are each optional, and a missing one switches that feature
 * off instead of crashing the app. The database and auth secret are required to run.
 */

export type ProviderMode = "mock" | "live";

const read = (name: string): string => (process.env[name] ?? "").trim();
const mode = (name: string): ProviderMode => (read(name) === "live" ? "live" : "mock");

export interface Env {
  prod: boolean;
  siteUrl: string;
  databaseUrl: string;
  poolSize: number;
  authSecret: string;
  authUrl: string;
  google: { clientId: string; clientSecret: string } | null;
  smtp: { host: string; port: number; user: string; pass: string; from: string } | null;
  ipHeader: string;
  mediaDir: string;
  credentialsKey: string;
  providers: { meta: ProviderMode; woo: ProviderMode; instagram: ProviderMode };
  modelApiKey: string;
  mockDelayMs: number;
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const siteUrl = (read("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000").replace(/\/+$/, "");
  const port = Number(read("SMTP_PORT") || "465");
  const smtpHost = read("SMTP_HOST");
  const smtpUser = read("SMTP_USER");
  const smtpPass = read("SMTP_PASS");
  const googleId = read("GOOGLE_CLIENT_ID");
  const googleSecret = read("GOOGLE_CLIENT_SECRET");
  cached = {
    prod: process.env.NODE_ENV === "production",
    siteUrl,
    databaseUrl: read("DATABASE_URL"),
    poolSize: Number(read("DATABASE_POOL_SIZE")) || 5,
    authSecret: read("BETTER_AUTH_SECRET"),
    authUrl: (read("BETTER_AUTH_URL") || siteUrl).replace(/\/+$/, ""),
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    smtp:
      smtpHost && smtpUser && smtpPass
        ? {
            host: smtpHost,
            port: Number.isFinite(port) ? port : 465,
            user: smtpUser,
            pass: smtpPass,
            from: read("MAIL_FROM") || smtpUser,
          }
        : null,
    ipHeader: (read("AUTH_IP_HEADER") || "x-forwarded-for").toLowerCase(),
    // a runtime location outside the deploy; the build must not trace it
    mediaDir: path.resolve(/*turbopackIgnore: true*/ read("MEDIA_DIR") || "./.data/media"),
    credentialsKey: read("CREDENTIALS_KEY"),
    providers: {
      meta: mode("PROVIDER_MODE_META"),
      woo: mode("PROVIDER_MODE_WOO"),
      instagram: mode("PROVIDER_MODE_INSTAGRAM"),
    },
    modelApiKey: read("MODEL_API_KEY"),
    mockDelayMs: Math.max(0, Number(read("MOCK_DELAY_MS")) || 0),
  };
  return cached;
}

/** What the sign-in page may offer. Sent to the browser, so it carries no secrets. */
export interface SignInOptions {
  google: boolean;
  /** Magic links need SMTP in production; in development they are printed to the console. */
  email: boolean;
}

export function signInOptions(e = env()): SignInOptions {
  return { google: !!e.google, email: !!e.smtp || !e.prod };
}
