import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { unauthorized } from "@/server/http";

/** The last 30 days as a CSV file, one row per Dhaka day, for sellers who keep their own books. */
export async function GET() {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const days = await forWorkspace(viewer.workspace.id).usageDays();
  const lines = [
    "date,listings,ai_photos,ai_calls,ai_cost_usd",
    ...days.map((d) => [d.day, d.listings, d.photos, d.calls, d.cost.toFixed(6)].join(",")),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="listsnap-usage-${days.at(-1)!.day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
