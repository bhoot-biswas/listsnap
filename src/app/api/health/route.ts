import { env } from "@/server/env";
import { databaseHealth } from "@/server/db/health";
import { mediaDirWritable } from "@/server/media/store";

/**
 * Is this deploy able to work? For a quick check after deploying and for an uptime
 * monitor. Public, so it says what is wrong but never why: no hosts, paths or errors.
 * 200 when the database and media folder work, 503 otherwise.
 */
export async function GET() {
  const e = env();
  const [db, media] = await Promise.all([databaseHealth(), mediaDirWritable()]);
  const ok = db.ok && media;
  return Response.json(
    {
      ok,
      database: db.ok ? "ok" : "down",
      migration: db.migration,
      media: media ? "ok" : "not writable",
      providers: e.providers,
      secrets: {
        auth: e.authSecret.length >= 32,
        credentialsKey: !!e.credentialsKey,
        metaKey: e.providers.meta === "mock" || !!e.modelApiKey,
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
