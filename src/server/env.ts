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
  providers: {
    meta: ProviderMode;
    woo: ProviderMode;
    shopify: ProviderMode;
    instagram: ProviderMode;
    facebook: ProviderMode;
    video: ProviderMode;
    /** Muse Spark Open (Meta's open weights) on Baseten, which reads the voice note. */
    baseten: ProviderMode;
  };
  /** Chrome workers per reel render; each takes about 256 MB. */
  reelWorkers: number;
  modelApiKey: string;
  basetenApiKey: string;
  mockDelayMs: number;
  /** The store every demo shop saves to. Null until configured. */
  demoWoo: { url: string; key: string; secret: string } | null;
  /** Our public Shopify app. Empty values until it is registered; the mock needs none. */
  shopify: { clientId: string; clientSecret: string; apiVersion: string };
  /** Our Meta app, for Facebook Login and posting. Empty values until it is set; the mocks need none. */
  metaApp: { appId: string; appSecret: string; loginConfigId: string; graphVersion: string };
  /** Our Shopify demo store, reached with its own app's keys. Null until configured. */
  demoShopify: { shop: string; clientId: string; clientSecret: string } | null;
  /** Where a store downloads product images from: the site URL, unless the store can't reach it (local Docker). */
  mediaFetchBaseUrl: string;
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
            // a full sender ("ListSnap <hello@…>"), as DEPLOY.md sets it
            from: read("MAIL_FROM") || `ListSnap <${smtpUser}>`,
          }
        : null,
    // X-Forwarded-For starts with whatever the visitor sent; X-Real-IP is set by our Nginx alone
    ipHeader: (read("AUTH_IP_HEADER") || "x-real-ip").toLowerCase(),
    // a runtime location outside the deploy; the build must not trace it
    mediaDir: path.resolve(/*turbopackIgnore: true*/ read("MEDIA_DIR") || "./.data/media"),
    credentialsKey: read("CREDENTIALS_KEY"),
    providers: {
      meta: mode("PROVIDER_MODE_META"),
      woo: mode("PROVIDER_MODE_WOO"),
      shopify: mode("PROVIDER_MODE_SHOPIFY"),
      instagram: mode("PROVIDER_MODE_INSTAGRAM"),
      facebook: mode("PROVIDER_MODE_FACEBOOK"),
      video: mode("PROVIDER_MODE_VIDEO"),
      baseten: mode("PROVIDER_MODE_BASETEN"),
    },
    reelWorkers: Math.min(8, Math.max(1, Number(read("REEL_WORKERS")) || 2)),
    modelApiKey: read("MODEL_API_KEY"),
    basetenApiKey: read("BASETEN_API_KEY"),
    mockDelayMs: Math.max(0, Number(read("MOCK_DELAY_MS")) || 0),
    demoWoo:
      read("DEMO_WOO_URL") && read("DEMO_WOO_KEY") && read("DEMO_WOO_SECRET")
        ? { url: read("DEMO_WOO_URL").replace(/\/+$/, ""), key: read("DEMO_WOO_KEY"), secret: read("DEMO_WOO_SECRET") }
        : null,
    // our public Shopify app (OAuth); the mock provider needs neither value
    shopify: {
      clientId: read("SHOPIFY_CLIENT_ID"),
      clientSecret: read("SHOPIFY_CLIENT_SECRET"),
      apiVersion: read("SHOPIFY_API_VERSION") || "2026-10",
    },
    // Facebook Login for Business asks for a saved configuration (permissions) by its id
    metaApp: {
      appId: read("META_APP_ID"),
      appSecret: read("META_APP_SECRET"),
      loginConfigId: read("META_LOGIN_CONFIG_ID"),
      graphVersion: read("META_GRAPH_VERSION") || "v24.0",
    },
    // a dev store in our own Shopify organisation, reached with its app's keys (client credentials)
    demoShopify:
      read("DEMO_SHOPIFY_SHOP") && read("DEMO_SHOPIFY_CLIENT_ID") && read("DEMO_SHOPIFY_CLIENT_SECRET")
        ? {
            shop: read("DEMO_SHOPIFY_SHOP"),
            clientId: read("DEMO_SHOPIFY_CLIENT_ID"),
            clientSecret: read("DEMO_SHOPIFY_CLIENT_SECRET"),
          }
        : null,
    mediaFetchBaseUrl: (read("MEDIA_FETCH_BASE_URL") || siteUrl).replace(/\/+$/, ""),
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

/**
 * Settings a production server can't work without, by name only (never values). The app
 * still starts without them, so the health check reports them and a deploy that would go
 * live with any of them missing switches back instead. Empty outside production.
 */
export function configProblems(e = env()): string[] {
  if (!e.prod) return [];
  const problems: string[] = [];
  if (!e.databaseUrl) problems.push("DATABASE_URL");
  if (!/^https:\/\//.test(e.siteUrl) || /localhost|127\.0\.0\.1/.test(e.siteUrl)) problems.push("NEXT_PUBLIC_SITE_URL");
  if (e.authSecret.length < 32) problems.push("BETTER_AUTH_SECRET");
  // store keys are encrypted with it; the wrong length fails only when a seller connects a store
  if (Buffer.from(e.credentialsKey, "base64").length !== 32) problems.push("CREDENTIALS_KEY");
  if (e.providers.meta === "live" && !e.modelApiKey) problems.push("MODEL_API_KEY");
  if (e.providers.baseten === "live" && !e.basetenApiKey) problems.push("BASETEN_API_KEY");
  if (e.providers.shopify === "live" && !(e.shopify.clientId && e.shopify.clientSecret))
    problems.push("SHOPIFY_CLIENT_ID/SECRET");
  if (
    (e.providers.facebook === "live" || e.providers.instagram === "live") &&
    !(e.metaApp.appId && e.metaApp.appSecret)
  )
    problems.push("META_APP_ID/SECRET");
  return problems;
}
