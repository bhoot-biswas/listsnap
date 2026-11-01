import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { fail, notFound, ok, unauthorized } from "@/server/http";
import { requestLocale } from "@/server/step-text";
import { mediaUrl } from "@/server/media/store";
import {
  CSV_FORMATS,
  CSV_NAMES,
  EXPORT_MAX,
  csvShop,
  exportCsv,
  kitEntries,
  kitName,
  kitLabels,
  loadExport,
  readMe,
} from "@/server/export/build";
import { marketplaceText } from "@/server/export/text";
import { toWebStream, zipStream, type ZipEntry } from "@/server/export/zip";
import { dhakaDay } from "@/lib/dhaka-day";

const Query = z.object({
  ids: z
    .string()
    .transform((s) => [...new Set(s.split(",").filter(Boolean))])
    .pipe(z.array(z.uuid()).min(1)),
  format: z.enum(["kit", "photos", ...CSV_FORMATS]),
});

/**
 * Marketplace-ready files for the ticked listings, made on request and never stored:
 * - `kit`: one listing's photos and copy-paste text as a zip, or for several, a zip with a
 *   kit folder each plus the three CSV files and a READ ME;
 * - `facebook`, `woocommerce`, `shopify`: one CSV on its own;
 * - `photos`: the photo links and English text, for sharing from a phone.
 */
export async function GET(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const params = new URL(request.url).searchParams;
  const q = Query.safeParse({ ids: params.get("ids") ?? "", format: params.get("format") });
  if (!q.success) return fail(400, "invalid", "invalidRequest");
  const { ids, format } = q.data;
  if (ids.length > EXPORT_MAX) return fail(400, "too_many", "exportTooMany", { max: EXPORT_MAX });
  const { workspace } = viewer;
  // Meta refuses a catalog row with no link, and the shop's website is the only one there is
  if (format === "facebook" && !workspace.settings.website) return fail(409, "no_website", "exportNeedsWebsite");

  const loaded = await loadExport(workspace, ids);
  if (!loaded.ok) return loaded.error === "not_found" ? notFound() : fail(409, "not_ready", "notFinished");
  const { listings } = loaded;
  const labels = kitLabels();
  const day = dhakaDay();

  if (format === "photos") {
    const first = listings[0]!;
    const p = first.product;
    return ok({
      name: kitName(first),
      urls: p.images.map((i) => mediaUrl(i.mediaId)),
      text: marketplaceText(
        p,
        { price: p.regularPrice, category: p.category, colours: p.variants?.map((v) => v.color) ?? [] },
        labels.en,
      ).replace(/^\uFEFF/, ""),
    });
  }

  if (format !== "kit") {
    const body = exportCsv(format, listings, await csvShop(workspace, listings));
    return download(body, `listsnap-${CSV_NAMES[format].replace(/\.csv$/, "")}-${day}.csv`, "text/csv; charset=utf-8");
  }

  if (listings.length === 1 && ids.length === 1) {
    const only = listings[0]!;
    return download(
      toWebStream(zipStream(kitEntries(workspace.id, only, labels))),
      `listsnap-${kitName(only)}.zip`,
      "application/zip",
    );
  }
  const shop = await csvShop(workspace, listings);
  const readme = readMe(await requestLocale(), !!workspace.settings.website);
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: "READ ME.txt", data: Buffer.from(readme) };
    for (const format of CSV_FORMATS)
      if (format !== "facebook" || shop.website)
        yield { name: CSV_NAMES[format], data: Buffer.from(exportCsv(format, listings, shop)) };
    const used = new Set<string>();
    for (const l of listings) {
      const name = kitName(l);
      if (used.has(name)) continue;
      used.add(name);
      yield* kitEntries(workspace.id, l, labels, `${name}/`);
    }
  }
  return download(toWebStream(zipStream(entries())), `listsnap-export-${day}.zip`, "application/zip");
}

function download(body: BodyInit, filename: string, type: string) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
