import { configProblems, env } from "@/server/env";
import { databaseHealth } from "@/server/db/health";
import { mediaDirWritable } from "@/server/media/store";

/**
 * Is this deploy able to work? For a quick check after deploying and for an uptime
 * monitor. Public, so it says what is wrong but never why: no hosts, paths or errors.
 * 200 when the database and media folder work and production's settings are complete,
 * 503 otherwise, which makes a deploy switch back to the release before.
 *
 * Which providers are live and which secrets are set is only for the server itself
 * (the deploy script, or `pnpm dev`): the proxy adds the client-IP header to every
 * request it passes on and a visitor can't remove it, so a request without it didn't
 * come through the proxy.
 */
export async function GET(request: Request) {
  const e = env();
  const [db, media] = await Promise.all([databaseHealth(), mediaDirWritable()]);
  const problems = configProblems(e);
  const ok = db.ok && media && !problems.length;
  const direct = !request.headers.get(e.ipHeader);
  return Response.json(
    {
      ok,
      database: db.ok ? "ok" : "down",
      media: media ? "ok" : "not writable",
      config: problems.length ? "incomplete" : "ok",
      ...(direct && {
        // names only, never values
        ...(problems.length > 0 && { missing: problems }),
        migration: db.migration,
        providers: e.providers,
        secrets: {
          auth: e.authSecret.length >= 32,
          credentialsKey: !!e.credentialsKey,
          metaKey: e.providers.meta === "mock" || !!e.modelApiKey,
        },
      }),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
