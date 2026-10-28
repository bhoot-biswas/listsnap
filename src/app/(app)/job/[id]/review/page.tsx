import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";
import { BanglaText, ListingText } from "@/lib/schemas/pipeline";
import { suggestedPrice, type ListingEdit } from "@/lib/schemas/review";
import { listingVariants } from "@/lib/variants";
import { ReviewForm, type ReviewPhoto } from "./_components/review-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("review"))("title") };
}

const EDITABLE = new Set(["needs_review", "ready", "in_store", "posted"]);

/** S7 Review: check and edit a listing, then save it to the store. `?l=` picks the listing. */
export default async function ReviewPage({ params, searchParams }: PageProps<"/job/[id]/review">) {
  const viewer = await requireWorkspace();
  const { id } = await params;
  const { l } = await searchParams;
  const ws = forWorkspace(viewer.workspace.id);
  const job = await ws.getJob(id);
  if (!job) notFound();
  const listings = (await ws.listings(id)).filter((x) => EDITABLE.has(x.status));
  const listing = listings.find((x) => x.id === l) ?? listings[0];
  if (!listing) notFound();

  const en = ListingText.safeParse(listing.fields_json?.en);
  if (!en.success) notFound();
  const bn = BanglaText.safeParse(listing.fields_json?.bn);
  const [items, media] = await Promise.all([ws.items(id), ws.listingMedia([listing.id])]);
  const main = items.find((i) => i.id === listing.item_ids_json[0])?.cutout_media_id;
  const photos: ReviewPhoto[] = [
    ...(main ? [{ id: main, url: mediaUrl(main), kind: "main", selected: true, locked: true }] : []),
    ...media.map((m) => ({ id: m.id, url: mediaUrl(m.id), kind: m.kind, selected: !!m.selected, locked: false })),
  ];

  const { title, short_description, description, category, attributes, tags, price_hint_bdt } = en.data;
  const initial: ListingEdit = {
    en: { title, short_description, description, category, attributes, tags },
    bn: bn.success
      ? {
          title: bn.data.title,
          short_description: bn.data.short_description,
          description: bn.data.description,
          attributes: bn.data.attributes,
          tags: bn.data.tags,
        }
      : null,
    priceBdt: listing.price_bdt ?? suggestedPrice(price_hint_bdt, viewer.workspace.settings.priceRounding),
    stockQty: listing.stock_qty,
    selectedMediaIds: media.filter((m) => m.selected).map((m) => m.id),
    variants: listingVariants(job.group_mode, listing.item_ids_json, items, listing.fields_json?.variants),
  };
  const colorPhotos = Object.fromEntries(
    items.flatMap((i) => (i.cutout_media_id ? [[i.id, mediaUrl(i.cutout_media_id)]] : [])),
  );

  const t = await getTranslations("review");
  return (
    <>
      <TopBar title={t("title")} />
      <ReviewForm
        key={listing.id}
        jobId={id}
        listingId={listing.id}
        initial={initial}
        photos={photos}
        colorPhotos={colorPhotos}
        hint={{ low: price_hint_bdt.low, high: price_hint_bdt.high }}
        confidence={listing.confidence}
        checkNotes={listing.check_notes ?? []}
        inStore={listing.status === "in_store" || listing.status === "posted"}
        others={listings.map((x, i) => ({
          id: x.id,
          n: i + 1,
          status: x.status,
          current: x.id === listing.id,
        }))}
      />
    </>
  );
}
