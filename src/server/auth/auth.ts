import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { anonymous, magicLink } from "better-auth/plugins";
import { env } from "@/server/env";
import { getPool } from "@/server/db/pool";
import { createWorkspaceForUser } from "@/server/db/workspaces";
import { seedDemoWorkspace } from "@/server/demo/seed";
import { sendMagicLinkMail } from "./mail";

/**
 * Better Auth, following the SOHOZ TOOLS setup (README → pre-existing code):
 *
 * - **Google** (main button) shows only when its client is configured, and the **magic
 *   link** only when mail can be sent (signInOptions). No passwords, so no reset flow.
 * - **"Try the demo"** is Better Auth's anonymous sign-in. The user.create hook gives
 *   that user a demo shop that expires in 24 hours. Signing in with Google from the
 *   demo deletes the anonymous user (and its membership) and starts a real account.
 * - **Rate limits live in the database**: Hostinger restarts the process on deploys and
 *   idle, and an in-memory counter would hand out a fresh allowance each time.
 * - **Account linking keeps its safe default**: Google joins an existing account only
 *   when that email is verified, which magic-link sign-in always is.
 */
export const COOKIE_PREFIX = "listsnap";
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Expired sessions and spent links don't delete themselves; prune at most hourly, on sign-in. */
let lastPrune = 0;
async function prune(now = Date.now()): Promise<void> {
  if (now - lastPrune < HOUR * 1000) return;
  lastPrune = now;
  const pool = getPool();
  try {
    await pool.query("DELETE FROM `session` WHERE `expiresAt` < UTC_TIMESTAMP(3)");
    await pool.query("DELETE FROM `verification` WHERE `expiresAt` < UTC_TIMESTAMP(3)");
    await pool.query("DELETE FROM `rateLimit` WHERE `lastRequest` < ?", [now - DAY * 1000]);
  } catch (err) {
    console.error("[auth] prune failed:", err instanceof Error ? err.message : err);
  }
}

function build() {
  const e = env();
  if (e.authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32).");
  }

  return betterAuth({
    appName: "ListSnap",
    baseURL: e.authUrl,
    secret: e.authSecret,
    database: getPool(),
    trustedOrigins: [e.authUrl, ...(e.prod ? [] : ["http://localhost:*"])],

    socialProviders: e.google
      ? { google: { clientId: e.google.clientId, clientSecret: e.google.clientSecret, prompt: "select_account" } }
      : {},

    user: {
      additionalFields: {
        uiLang: { type: "string", required: false, input: true },
        theme: { type: "string", required: false, input: true },
        phone: { type: "string", required: false, input: true },
      },
    },

    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/magic-link": { window: 10 * 60, max: 5 },
        "/sign-in/anonymous": { window: 10 * 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },

    advanced: {
      useSecureCookies: e.prod,
      cookiePrefix: COOKIE_PREFIX,
      ipAddress: { ipAddressHeaders: [e.ipHeader] },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const demo = !!(user as { isAnonymous?: boolean }).isAnonymous;
            const workspaceId = await createWorkspaceForUser(user.id, { demo });
            // an empty demo is still a working demo, so a seeding problem never blocks sign-in
            if (demo) await seedDemoWorkspace(workspaceId).catch((err) => console.error("[demo] seeding failed:", err));
          },
        },
      },
      session: { create: { after: async () => void prune() } },
    },

    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => sendMagicLinkMail(email, url),
      }),
      anonymous({ emailDomainName: "demo.listsnap.invalid", generateName: () => "Demo seller" }),
      // must stay last: lets Server Actions set the session cookie
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof build>;
const g = globalThis as unknown as { __listsnapAuth?: Auth };

/** The auth instance, built once per process on first use. */
export function getAuth(): Auth {
  g.__listsnapAuth ??= build();
  return g.__listsnapAuth;
}

export type AuthSession = Auth["$Infer"]["Session"];
