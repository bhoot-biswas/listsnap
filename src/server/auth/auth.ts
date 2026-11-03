import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { anonymous, magicLink } from "better-auth/plugins";
import { env } from "@/server/env";
import { getPool } from "@/server/db/pool";
import { createWorkspaceForUser, deleteSoleWorkspaces } from "@/server/db/workspaces";
import { removeWorkspaceMedia } from "@/server/media/store";
import { seedDemoWorkspace } from "@/server/demo/seed";
import { requestLocale } from "@/server/step-text";
import { sendMagicLinkMail } from "./mail";
import { checkUserWrite } from "./profile-fields";

/**
 * Better Auth, on our own MySQL pool. Three ways in:
 *
 * - **Email link** (magic-link plugin): the mail links to /sign-in/confirm, not to the
 *   verify endpoint, because mail scanners open every link and the token works once.
 * - **Google**, offered only once its keys are set.
 * - **Try the demo shop** (anonymous plugin): the new user gets a demo shop that expires
 *   in a day. Signing in for real from the demo drops the anonymous user, which the plugin
 *   does by default, and the seller starts a shop of their own.
 *
 * Every new user gets a workspace in the user-create hook, so the DAL can rely on one.
 */

/** Must match the prefix src/proxy.ts looks for. */
export const COOKIE_PREFIX = "listsnap";

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;
// the sign-in page and the mail both promise 15 minutes
const LINK_MINUTES = 15;

function build() {
  const e = env();
  return betterAuth({
    appName: "ListSnap",
    baseURL: e.authUrl,
    secret: e.authSecret,
    database: getPool(),
    socialProviders: e.google
      ? { google: { clientId: e.google.clientId, clientSecret: e.google.clientSecret, prompt: "select_account" } }
      : {},
    user: {
      additionalFields: {
        uiLang: { type: "string", required: false },
        theme: { type: "string", required: false },
        phone: { type: "string", required: false },
      },
      deleteUser: {
        enabled: true,
        // a shop only this seller belongs to goes with them; its files after its rows
        beforeDelete: async (user) => {
          const ids = await deleteSoleWorkspaces(user.id);
          await Promise.all(ids.map((id) => removeWorkspaceMedia(id)));
        },
      },
    },
    // deleting an account needs a sign-in from the last day, so an old stolen session can't
    session: { freshAge: DAY },
    rateLimit: {
      storage: "database",
      customRules: {
        // each demo seeds a shop with photos; a script mustn't be able to fill the disk
        "/sign-in/anonymous": { window: 10 * MINUTE, max: 10 },
        "/sign-in/magic-link": { window: 10 * MINUTE, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      ipAddress: { ipAddressHeaders: [e.ipHeader] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!checkUserWrite(user)) throw new APIError("BAD_REQUEST", { message: "Invalid profile field" });
          },
          after: async (user) => {
            const demo = !!(user as { isAnonymous?: boolean }).isAnonymous;
            const workspaceId = await createWorkspaceForUser(user.id, { demo });
            // an empty demo still works, so a seeding problem must not stop the sign-in
            if (demo) await seedDemoWorkspace(workspaceId).catch((err) => console.error("[demo] seeding failed:", err));
          },
        },
        update: {
          // /update-user takes these fields straight from the browser
          before: async (data) => {
            if (!checkUserWrite(data)) throw new APIError("BAD_REQUEST", { message: "Invalid profile field" });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: LINK_MINUTES * MINUTE,
        sendMagicLink: async ({ email, url }) => {
          const confirm = new URL("/sign-in/confirm", e.siteUrl);
          confirm.search = new URL(url).search;
          sendMagicLinkMail(email, confirm.toString(), await requestLocale());
        },
      }),
      anonymous({ emailDomainName: "demo.listsnap.invalid", generateName: () => "Demo seller" }),
      // keep last: it sets cookies from Server Actions too
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof build>;

let auth: Auth | undefined;

/** Built on first use, so importing this module never reads env or opens the pool. */
export function getAuth(): Auth {
  auth ??= build();
  return auth;
}

export type AuthSession = Auth["$Infer"]["Session"];
