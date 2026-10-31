import "server-only";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { editUrl as shopifyEditUrl } from "@/server/providers/shopify/draft";
import { errorText } from "@/server/step-text";
import type { Locale } from "@/i18n/request";
import { ShopifySettings } from "@/lib/shopify-connection";
import { WooSettings } from "@/lib/woo-connection";
import { listingHref } from "@/lib/listing-links";
import type { StoreKind } from "@/lib/stores";

type ListingHref = ReturnType<typeof listingHref>;

/**
 * What a store's page shows under Recent activity: the last drafts saved there, and the
 * last save that failed if nothing has been saved since. It shows a seller the store is
 * working without opening the store.
 */
export interface StoreActivity {
  saves: { listingId: string; title: string | null; savedAt: Date; href: ListingHref; storeUrl: string | null }[];
  failure: { title: string | null; at: Date; href: ListingHref; reason: string } | null;
}

export async function storeActivity(workspace: Workspace, kind: StoreKind, locale: Locale): Promise<StoreActivity> {
  const ws = forWorkspace(workspace.id);
  const [row, saves, failure] = await Promise.all([
    ws.storeConnection(kind),
    ws.recentStoreSaves(kind),
    ws.lastStoreFailure(kind),
  ]);
  const title = (r: { title: string | null; title_bn: string | null }) =>
    (locale === "bn" ? (r.title_bn ?? r.title) : r.title) || null;

  // a demo store's admin isn't the seller's to open, so its drafts get no store link
  const settings = (kind === "woo" ? WooSettings : ShopifySettings).parse(row?.settings_json ?? {});
  const base = settings.demo ? null : (row?.base_url ?? null);
  const storeUrl = (ref: string) =>
    !base
      ? null
      : kind === "woo"
        ? `${base}/wp-admin/post.php?post=${encodeURIComponent(ref)}&action=edit`
        : shopifyEditUrl(base.replace(/^https?:\/\//, ""), ref);

  const latest = saves[0]?.saved_at.getTime() ?? 0;
  const stillFailing = failure?.finished_at && failure.finished_at.getTime() > latest;

  return {
    saves: saves.map((s) => ({
      listingId: s.listing_id,
      title: title(s),
      savedAt: s.saved_at,
      href: listingHref({ job_id: s.job_id, id: s.listing_id, status: s.status }),
      storeUrl: storeUrl(s.product_ref),
    })),
    failure:
      failure && stillFailing
        ? {
            title: title(failure),
            at: failure.finished_at!,
            href: listingHref({ job_id: failure.job_id, id: failure.listing_id, status: failure.status }),
            reason: failure.last_error ? errorText(failure.last_error, locale) : "",
          }
        : null,
  };
}
