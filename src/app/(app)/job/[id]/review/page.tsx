import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";
import { BanglaText, ListingText } from "@/lib/schemas/pipeline";
import { suggestedPrice, type ListingEdit } from "@/lib/schemas/review";
import { listingVariants } from "@/lib/variants";
import { lookOf, type Look } from "@/lib/schemas/looks";
import { REEL_LANGS, ReelResult } from "@/lib/schemas/reels";
import { REELS_PER_DAY } from "@/server/db/limits";
import { DESTINATIONS, PostResult } from "@/lib/schemas/social";
import { defaultCaption } from "@/server/social/caption";
import { metaConnection, publicMeta } from "@/server/social/connection";
import { text } from "@/server/step-text";
import { chatItems, chatRevision } from "@/server/chat/view";
import { ReviewForm, type ReviewPhoto } from "./_components/review-form";
import { StillMaking } from "./_components/still-making";
import type { VoiceNoteView } from "./_components/voice-note-card";
import { ListenResult } from "@/lib/schemas/voice-note";
import { localTitle } from "@/lib/titles";
import { numberRepeats, REVIEWABLE } from "@/lib/review-next";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("review"))("title") };
}

/** S7 Review: check and edit a listing, then save it to the store. `?l=` picks the listing. */
export default async function ReviewPage({ params, searchParams }: PageProps<"/job/[id]/review">) {
  const viewer = await requireWorkspace();
  const { id } = await params;
  const { l } = await searchParams;
  const ws = forWorkspace(viewer.workspace.id);
  const job = await ws.getJob(id);
  if (!job) notFound();
  const all = await ws.listings(id);
  const listings = all.filter((x) => REVIEWABLE.has(x.status));
  // an old link, or a refresh while the Bangla and photos are still being made
  const asked = all.find((x) => x.id === l);
  if (asked?.status === "processing" || (!listings.length && all.some((x) => x.status === "processing")))
    return (
      <>
        <TopBar title={(await getTranslations("review"))("title")} />
        <StillMaking jobId={id} />
      </>
    );
  const listing = listings.find((x) => x.id === l) ?? listings[0];
  if (!listing) notFound();

  const en = ListingText.safeParse(listing.fields_json?.en);
  if (!en.success) notFound();
  const bn = BanglaText.safeParse(listing.fields_json?.bn);
  const [items, media, usage, reelResults, postResults, meta] = await Promise.all([
    ws.items(id),
    ws.listingMedia([listing.id]),
    ws.usageToday(),
    Promise.all(REEL_LANGS.map((lang) => ws.stepResult(id, "reel", `${listing.id}:showcase:${lang}`))),
    Promise.all(
      REEL_LANGS.flatMap((lang) => DESTINATIONS.map((d) => ws.stepResult(id, "post", `${listing.id}:${lang}:${d}`))),
    ),
    metaConnection(ws),
  ]);
  const chatId = await ws.listingChat(listing.id);
  // a voice note, or what the seller said in the video this job came from
  const heard = ListenResult.safeParse(await ws.stepResult(id, "listen"));
  const voiceNote: VoiceNoteView | null =
    job.voice_media_id || heard.success
      ? {
          url: job.voice_media_id ? mediaUrl(job.voice_media_id) : null,
          transcript: heard.success ? heard.data.transcript : null,
          fromAudio: heard.success && heard.data.heardBy === "audio",
          fromVideo: heard.success && heard.data.heardBy === "video",
          facts: heard.success ? heard.data.facts : null,
          used: all.length === 1,
        }
      : null;
  const history = chatId ? await ws.chatMessages(chatId) : [];
  const posted: Record<string, Record<string, { permalink: string; test: boolean }>> = {};
  for (const raw of postResults) {
    const p = PostResult.safeParse(raw);
    if (p.success)
      (posted[p.data.lang] ??= {})[p.data.destination] = { permalink: p.data.permalink, test: p.data.test };
  }
  const reels = Object.fromEntries(
    REEL_LANGS.map((lang, i) => {
      const r = ReelResult.safeParse(reelResults[i]);
      return [lang, r.success ? { url: mediaUrl(r.data.mediaId), aiScene: r.data.aiLabel === "ai_scene" } : null];
    }),
  );
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
  const locale = await getLocale();
  const tabs = numberRepeats(
    listings.map((x) => {
      const title = localTitle(
        {
          title: (x.fields_json?.en as { title?: string } | undefined)?.title ?? null,
          title_bn: (x.fields_json?.bn as { title?: string } | undefined)?.title ?? null,
        },
        locale,
      );
      const thumb = items.find((it) => it.id === x.item_ids_json[0])?.cutout_media_id;
      return {
        id: x.id,
        status: x.status,
        current: x.id === listing.id,
        title: title.text,
        lang: title.lang,
        thumb: thumb ? mediaUrl(thumb) : null,
      };
    }),
    (title, n) => t("titleN", { title, n }),
  );
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
        voiceNote={voiceNote}
        status={listing.status}
        inStore={listing.status === "in_store" || listing.status === "posted"}
        hasWebsite={!!viewer.workspace.settings.website}
        archived={!!listing.archived_at}
        storeBehind={!!listing.sent_at && !!listing.edited_at && listing.edited_at > listing.sent_at}
        looks={{
          made: media.map((m) => lookOf(m.kind)).filter((l): l is Look => l !== null),
          imagesLeft: Math.max(0, viewer.workspace.limits.images - usage.images),
        }}
        reels={{
          made: reels,
          langs: bn.success ? [...REEL_LANGS] : ["en"],
          left: Math.max(0, REELS_PER_DAY - usage.reels),
          social: {
            account: publicMeta(meta),
            posted,
            captions: {
              en: defaultCaption({
                lang: "en",
                title: en.data.title,
                shortDescription: en.data.short_description,
                priceBdt: listing.price_bdt,
                tags: en.data.tags,
              }),
              ...(bn.success && {
                bn: defaultCaption({
                  lang: "bn",
                  title: bn.data.title,
                  shortDescription: bn.data.short_description,
                  priceBdt: listing.price_bdt,
                  tags: bn.data.tags,
                }),
              }),
            },
          },
        }}
        marketplace={{
          lang: viewer.workspace.settings.marketplaceLang ?? (locale === "bn" ? "bn" : "en"),
          coloursLabel: { en: text("en", "export.text.colours"), bn: text("bn", "export.text.colours") },
          posted: listing.marketplace_posted_at
            ? { at: listing.marketplace_posted_at.toISOString(), url: listing.marketplace_url }
            : null,
        }}
        chat={{ items: chatItems(history), revision: chatRevision(history) }}
        others={tabs}
      />
    </>
  );
}
