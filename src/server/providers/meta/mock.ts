import "server-only";
import sharp from "sharp";
import { env } from "@/server/env";
import { gradient } from "@/server/image-ops";
import type { BanglaText, ListingText, PlanResult } from "@/lib/schemas/pipeline";
import { logged } from "../log";
import type { AssistInput, MetaProvider, SegmentInstance } from "../types";

/**
 * Deterministic stand-ins for Muse Spark, SAM 3.1 and Muse Image: no key, no cost,
 * same answer every time. Calls are still logged (mode "mock", $0) so the Under the
 * hood panel works. MOCK_DELAY_MS slows them down to watch the progress UI.
 *
 * One rule picks the multi-item path, so it can be tried by hand: a photo at least
 * twice as wide as it is tall is treated as three different designs side by side.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delay = () => sleep(env().mockDelayMs * (0.6 + Math.random() * 0.8));

const isWide = async (photo: Buffer) => {
  const m = await sharp(photo).metadata();
  return (m.width ?? 1) >= 2 * (m.height ?? 1);
};

const SPARK = { provider: "meta", model: "muse-spark-1.3 (mock)", mode: "mock" } as const;
const SAM = { provider: "meta", model: "sam-3.1 (mock)", mode: "mock" } as const;
const IMAGE = { provider: "meta", model: "muse-image-1.0 (mock)", mode: "mock" } as const;

export const mockMeta: MetaProvider = {
  mode: "mock",

  plan: (ctx, photo) =>
    logged(
      ctx,
      { ...SPARK, endpoint: "chat/completions" },
      async (): Promise<PlanResult> => {
        await delay();
        const wide = await isWide(photo);
        return {
          sam_phrase: wide ? "handloom tote bag" : "jamdani saree",
          alt_phrases: wide ? ["tote bag", "bag"] : ["saree", "cotton saree"],
          category_guess: wide ? "Bags" : "Sarees",
          likely_multi: wide,
          item_count_guess: wide ? 3 : 1,
          multi_kind: wide ? "different_designs" : "single",
          camera_angle: "top_down",
          photo_notes: "Even light, a little background clutter.",
        };
      },
      (r) => ({ summary: `phrase "${r.sam_phrase}" · ${r.multi_kind} · ${r.camera_angle}`, costUsd: 0 }),
    ),

  segment: (ctx, photo, phrase) =>
    logged(
      ctx,
      { ...SAM, endpoint: "responses" },
      async (): Promise<SegmentInstance[]> => {
        await delay();
        const m = await sharp(photo).metadata();
        const W = m.width ?? 1;
        const H = m.height ?? 1;
        const n = (await isWide(photo)) ? 3 : 1;
        const colW = W / n;
        return Array.from({ length: n }, (_, i) => ({
          box: {
            x: Math.round(i * colW + colW * 0.12),
            y: Math.round(H * 0.12),
            w: Math.round(colW * 0.76),
            h: Math.round(H * 0.76),
          },
          score: 0.9 - i * 0.04,
        }));
      },
      (r) => ({ summary: `"${phrase}" → ${r.length} instance(s)`, costUsd: 0 }),
    ),

  // visibly different every time it matters, so the Review buttons can be tried without a key
  assist: (ctx, input) =>
    logged(
      ctx,
      { ...SPARK, endpoint: "chat/completions" },
      async () => {
        await delay();
        return mockAssist(input);
      },
      () => ({ summary: `${input.action} ${input.lang} ${input.field}`, costUsd: 0 }),
    ),

  group: (ctx, crops) =>
    logged(
      ctx,
      { ...SPARK, endpoint: "chat/completions" },
      async () => {
        await delay();
        const palette = ["Indigo", "Maroon", "Mustard", "Teal", "Olive", "Coral"];
        return {
          mode: "separate" as const,
          colors: crops.map((_, i) => palette[i % palette.length]!),
          reason: "Different patterns, so each is its own product.",
        };
      },
      (r) => ({ summary: `suggest ${r.mode} · ${r.colors.join(", ")}`, costUsd: 0 }),
    ),

  write: (ctx, _photo, plan) =>
    logged(
      ctx,
      { ...SPARK, endpoint: "chat/completions" },
      async (): Promise<ListingText> => {
        await delay();
        const bag = plan.category_guess === "Bags";
        return {
          title: bag ? "Handloom Cotton Tote Bag" : "Handwoven Jamdani Saree with Zari Border",
          short_description: bag
            ? "A roomy handloom tote for daily use, woven in soft cotton."
            : "A light, airy jamdani saree with a woven zari border, for festive days.",
          description: bag
            ? "Woven on a handloom in soft cotton.\nRoomy enough for a laptop, books and a water bottle.\nSturdy shoulder straps.\nSee photos for the pattern."
            : "Handwoven jamdani with fine motifs across the body.\nWoven zari border and pallu.\nLight and comfortable for long wear.\nDry clean recommended.",
          category: plan.category_guess,
          attributes: bag
            ? [{ name: "Material", value: "Cotton" }]
            : [
                { name: "Fabric", value: "Cotton blend" },
                { name: "Border", value: "Zari" },
              ],
          tags: bag
            ? ["tote bag", "handloom", "cotton bag", "everyday bag", "eco bag"]
            : ["jamdani", "saree", "handloom", "festive saree", "zari"],
          price_hint_bdt: bag
            ? { low: 450, high: 900, basis: "Typical handloom totes online." }
            : { low: 2800, high: 6500, basis: "Typical jamdani range on Facebook shops." },
          confidence: bag ? 0.82 : 0.66,
          check_notes: bag ? [] : ["Check the fabric: handloom or powerloom, cotton or silk blend."],
        };
      },
      (r) => ({ summary: `"${r.title}" · confidence ${r.confidence}`, costUsd: 0 }),
    ),

  translate: (ctx, listing) =>
    logged(
      ctx,
      { ...SPARK, endpoint: "chat/completions" },
      async (): Promise<BanglaText> => {
        await delay();
        const bag = listing.category === "Bags";
        return {
          title: bag ? "হ্যান্ডলুম কটন টোট ব্যাগ" : "জরি পাড়ের হাতে বোনা জামদানি শাড়ি",
          short_description: bag
            ? "প্রতিদিনের জন্য বড়সড় হ্যান্ডলুম টোট, নরম কটনে বোনা।"
            : "উৎসবের দিনের জন্য হালকা, আরামদায়ক জামদানি শাড়ি, জরির পাড়সহ।",
          description: bag
            ? "নরম কটনে তাঁতে বোনা।\nল্যাপটপ, বই আর পানির বোতল সহজেই ধরে।\nমজবুত কাঁধের ফিতা।\nনকশা দেখতে ছবিগুলো দেখুন।"
            : "পুরো জমিনে সূক্ষ্ম মোটিফে হাতে বোনা জামদানি।\nজরির পাড় ও আঁচল।\nহালকা, অনেকক্ষণ পরে আরাম।\nড্রাই ক্লিন করাই ভালো।",
          attributes: listing.attributes.map((a) => ({ name: a.name, value: a.value })),
          tags: bag
            ? ["টোট ব্যাগ", "হ্যান্ডলুম", "কটন ব্যাগ", "tote bag"]
            : ["জামদানি", "শাড়ি", "তাঁতের শাড়ি", "jamdani saree"],
        };
      },
      (r) => ({ summary: `"${r.title}"`, costUsd: 0 }),
    ),

  background: (ctx, scene, angle) =>
    logged(
      ctx,
      { ...IMAGE, endpoint: "images/generations" },
      async () => {
        await delay();
        if (scene === "banner") return gradient(1536, 768, "#F8ECD2", "#DCEFE7");
        return angle === "top_down"
          ? gradient(1024, 1024, "#ECEDEA", "#D9DCD6")
          : gradient(1024, 1024, "#F4F5F2", "#DADDD7");
      },
      () => ({ summary: `${scene} background (${angle})`, costUsd: 0 }),
    ),

  editScene: (ctx, main, scene) =>
    logged(
      ctx,
      { ...IMAGE, endpoint: "images/edits" },
      async () => {
        await delay();
        const bg = await gradient(1024, 1024, "#E9D6B8", "#B98B5E");
        const product = await sharp(main).resize(700, 700, { fit: "inside" }).png().toBuffer();
        return sharp(bg)
          .composite([{ input: product, gravity: "centre", blend: "multiply" }])
          .jpeg({ quality: 86 })
          .toBuffer();
      },
      () => ({ summary: `${scene} scene from the cutout`, costUsd: 0 }),
    ),
};

const MOCK_BANGLA: Record<AssistInput["field"], string> = {
  title: "হাতে তৈরি সুন্দর পণ্য",
  short_description: "প্রতিদিনের ব্যবহারের জন্য আরামদায়ক ও সুন্দর।",
  description: "যত্ন করে তৈরি, প্রতিদিন ব্যবহারের উপযোগী।\n\nনকশা ভালো করে দেখতে ছবিগুলো দেখুন।",
};

function mockAssist(input: AssistInput): string {
  const text = input.text.trim();
  const bn = input.lang === "bn";
  const sentences = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  switch (input.action) {
    case "translate":
      return MOCK_BANGLA[input.field];
    case "shorter":
      if (input.field === "title") return text.split(/\s+/).slice(0, 4).join(" ");
      return sentences.length > 1
        ? sentences.slice(0, Math.ceil(sentences.length / 2)).join(" ")
        : text.slice(0, Math.ceil(text.length / 2));
    case "longer":
      return `${text}\n\n${bn ? "নরম কাপড়ে আলতো করে মুছে রাখুন। নকশা দেখতে ছবিগুলো দেখুন।" : "Easy to care for: wipe or wash gently and dry in the shade. See photos for detail."}`;
    case "rewrite":
      return sentences.length > 1 ? [...sentences].reverse().join(" ") : `${bn ? "সুন্দর" : "Lovely"} ${text}`;
  }
}
