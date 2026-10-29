import "server-only";
import type { BanglaText, GroupMode, ListingText, PlanResult } from "@/lib/schemas/pipeline";
import type { ListingStatus } from "@/server/db/scope";

/**
 * The three listings every "Try the demo" shop starts with. The photos were made with
 * Muse Image; the plans, SAM boxes, cutouts and English text are real model output
 * from running those photos through the pipeline, so the demo shows what the models
 * actually return. Files live in public/samples/ ({key}.jpg, {key}-{n}.jpg cutouts in
 * item order, {key}-studio.jpg), which also lets the Snap page offer them as samples.
 */

export interface DemoSample {
  key: "saree" | "bangles" | "kurti";
  plan: PlanResult;
  /** SAM boxes in the 1600 px photo the models saw, left to right. */
  boxes: { x: number; y: number; w: number; h: number; score: number }[];
  mode: GroupMode;
  reason: string;
  colors: string[];
  status: ListingStatus;
  en: ListingText;
  bn: BanglaText;
}

export const SAMPLE_SOURCE_SIZE = 1600;

const box = (left: number, top: number, right: number, bottom: number, score: number) => ({
  x: left,
  y: top,
  w: right - left,
  h: bottom - top,
  score,
});

/** Oldest first, so the saree ends up as the most recent listing. */
export const DEMO_SAMPLES: DemoSample[] = [
  {
    key: "kurti",
    plan: {
      sam_phrase: "embroidered kurti",
      alt_phrases: ["kurti", "embroidered kurta", "long kurta"],
      category_guess: "Kurtis",
      likely_multi: true,
      item_count_guess: 4,
      multi_kind: "same_design_different_colors",
      camera_angle: "top_down",
      photo_notes: "Flat lay on tiled floor with uneven natural light and slight wrinkles.",
      // written by hand: these plans were recorded before the plan step wrote briefs
      scene_brief: {
        setting: "hanging on a wooden hanger against a warm off-white wall in soft daylight",
        palette: ["off-white", "light oak", "sage"],
        avoid: ["trousers or a dupatta", "other kurtis"],
      },
    },
    boxes: [
      box(0, 303, 461, 1433, 0.957),
      box(388, 303, 812, 1427, 0.957),
      box(747, 309, 1163, 1429, 0.953),
      box(1092, 320, 1600, 1475, 0.961),
    ],
    mode: "variants",
    reason: "Same kurti in four colours, so one listing with a Color choice.",
    colors: ["Maroon", "Mustard", "Navy", "Mint"],
    status: "ready",
    en: {
      title: "Floral Embroidered Straight Kurti with Buttons",
      short_description:
        "Long straight kurti with white floral neck embroidery and front buttons. Comes in maroon, mustard, navy and mint.",
      description:
        "Beautiful straight-cut long kurti for daily, office and casual wear.\n\nRound neckline with white floral embroidery and button detail on the front placket. 3/4 sleeves and clean straight shape.\n\nLightweight woven fabric, soft and comfortable to wear. See photos for detail and texture.\n\nAvailable in 4 colours: maroon, mustard yellow, navy blue and light mint green. Pair with leggings, palazzo or jeans.",
      category: "Kurtis",
      attributes: [
        { name: "Color", value: "Maroon, Mustard Yellow, Navy Blue, Mint Green" },
        { name: "Neckline", value: "Round neck with floral embroidery" },
        { name: "Sleeve", value: "3/4 sleeve" },
        { name: "Fit", value: "Straight relaxed fit" },
      ],
      tags: ["kurti", "embroidered kurti", "straight kurti", "daily wear kurti", "cotton kurti", "office kurti"],
      price_hint_bdt: {
        low: 650,
        high: 1200,
        basis: "Everyday embroidered straight kurtis usually sell in this range online",
      },
      confidence: 0.78,
      check_notes: [
        "Check fabric type - looks like cotton or cotton blend",
        "Check available sizes, length and bust measurements",
        "Check if front buttons are functional or decorative",
      ],
    },
    bn: {
      title: "বোতামসহ ফুলেল এমব্রয়ডারি সোজা কুর্তি",
      short_description:
        "গলায় সাদা ফুলেল এমব্রয়ডারি আর সামনে বোতামসহ লম্বা সোজা কুর্তি। মেরুন, মাস্টার্ড, নেভি আর মিন্ট রঙে।",
      description:
        "প্রতিদিন, অফিস আর ক্যাজুয়াল পরার জন্য লম্বা সোজা কাটের কুর্তি।\n\nগোল গলায় সাদা ফুলেল এমব্রয়ডারি, সামনের প্ল্যাকেটে বোতাম। থ্রি-কোয়ার্টার হাতা, পরিষ্কার সোজা গড়ন।\n\nহালকা বোনা কাপড়, নরম আর আরামদায়ক। কাপড়ের টেক্সচার ছবিতে দেখুন।\n\n৪টি রঙে পাওয়া যায়: মেরুন, মাস্টার্ড হলুদ, নেভি ব্লু আর হালকা মিন্ট সবুজ। লেগিংস, পালাজো বা জিন্সের সঙ্গে পরুন।",
      attributes: [
        { name: "রং", value: "মেরুন, মাস্টার্ড হলুদ, নেভি ব্লু, মিন্ট সবুজ" },
        { name: "গলা", value: "ফুলেল এমব্রয়ডারিসহ গোল গলা" },
        { name: "হাতা", value: "থ্রি-কোয়ার্টার" },
        { name: "ফিট", value: "সোজা, আরামদায়ক" },
      ],
      tags: ["কুর্তি", "এমব্রয়ডারি কুর্তি", "সোজা কুর্তি", "অফিস কুর্তি", "kurti"],
    },
  },
  {
    key: "bangles",
    plan: {
      sam_phrase: "resin bangle",
      alt_phrases: ["glass bangle", "acrylic bangle"],
      category_guess: "Bangles",
      likely_multi: true,
      item_count_guess: 6,
      multi_kind: "different_designs",
      camera_angle: "top_down",
      photo_notes: "Bright top-down shot on wrinkled white cloth with brush and mirror as props.",
      scene_brief: {
        setting: "arranged on dark green velvet on a wooden dressing table",
        palette: ["deep green", "warm gold", "ivory"],
        avoid: ["a brush or mirror", "other jewellery"],
      },
    },
    boxes: [
      box(31, 636, 280, 970, 0.899),
      box(282, 594, 495, 925, 0.895),
      box(528, 581, 695, 911, 0.899),
      box(744, 581, 880, 910, 0.895),
      box(931, 590, 1066, 918, 0.895),
      box(1130, 598, 1268, 938, 0.895),
    ],
    mode: "variants",
    reason: "One bangle style in six colours, so one listing with a colour choice.",
    colors: ["Teal", "Pink", "Purple", "Green", "Amber", "Blue"],
    // the seller still has to say whether these sell one by one or as a set
    status: "needs_review",
    en: {
      title: "Chunky Colorful Resin Bangle for Women",
      short_description:
        "Chunky glossy resin bangle in floral and patterned colours. Choose your favourite from the photos.",
      description:
        "Chunky glossy bangle in pretty translucent colours with floral, glitter and patterned details inside.\nMade in glossy resin-look finish with inlaid design - see photos for detail.\nWide rounded shape that slips on the wrist. Lightweight for daily wear.\nWipe with a soft dry cloth and keep away from perfume and water to keep shine.\nPerfect for daily use, office, university looks, or as a small gift for jewellery lovers.",
      category: "Bangles",
      attributes: [
        { name: "Material", value: "Resin" },
        { name: "Style", value: "Chunky wide bangle" },
        { name: "Pattern", value: "Floral, glitter and geometric print" },
      ],
      tags: ["resin bangle", "acrylic bangle", "chunky bangle", "floral bangle", "wide bangle", "fashion jewellery"],
      price_hint_bdt: {
        low: 180,
        high: 350,
        basis: "Single fashion resin bangles usually sell in this range in BD shops",
      },
      confidence: 0.72,
      check_notes: [
        "Check material: resin vs acrylic",
        "Confirm if sold per piece or as set of 6",
        "Measure inner diameter and width",
        "Confirm which colours are in stock",
      ],
    },
    bn: {
      title: "রঙিন চওড়া রেজিন চুড়ি",
      short_description: "ফুলেল আর নকশাদার রঙে চকচকে চওড়া রেজিন চুড়ি। ছবি দেখে পছন্দের রং বেছে নিন।",
      description:
        "ভেতরে ফুল, গ্লিটার আর নকশার কাজসহ স্বচ্ছ রঙের চকচকে চওড়া চুড়ি।\nচকচকে রেজিন ফিনিশ, নকশা দেখতে ছবিগুলো দেখুন।\nগোল চওড়া গড়ন, হাতে সহজে পরা যায়। হালকা, প্রতিদিন পরার মতো।\nনরম শুকনো কাপড়ে মুছুন, পারফিউম আর পানি থেকে দূরে রাখুন।\nপ্রতিদিন, অফিস, ক্যাম্পাস বা ছোট উপহারের জন্য দারুণ।",
      attributes: [
        { name: "উপাদান", value: "রেজিন" },
        { name: "স্টাইল", value: "চওড়া চুড়ি" },
        { name: "নকশা", value: "ফুলেল, গ্লিটার ও জ্যামিতিক" },
      ],
      tags: ["রেজিন চুড়ি", "চওড়া চুড়ি", "রঙিন চুড়ি", "ফ্যাশন গয়না", "resin bangle"],
    },
  },
  {
    key: "saree",
    plan: {
      sam_phrase: "jamdani saree",
      alt_phrases: ["red saree", "folded saree"],
      category_guess: "Sarees",
      likely_multi: false,
      item_count_guess: 1,
      multi_kind: "single",
      camera_angle: "top_down",
      photo_notes: "Overhead shot in natural light with heavy desk clutter around the fabric.",
      scene_brief: {
        setting: "draped over the arm of a carved wooden chair by a sunlit window",
        palette: ["cream", "warm wood", "soft green"],
        avoid: ["a matching blouse", "jewellery"],
      },
    },
    boxes: [box(171, 57, 1092, 1011, 0.808)],
    mode: "single",
    reason: "One item.",
    colors: [],
    status: "ready",
    en: {
      title: "Red Jamdani Saree with Gold Zari Work",
      short_description: "Classic red Jamdani saree with gold floral butis and rich woven border for festive wear.",
      description:
        "Gorgeous red Jamdani-style saree with all-over gold floral butis and wide woven border, as shown in photos.\nFestive traditional look that pairs beautifully with gold jewellery. See photos for detail on design and colour.\nStandard saree drape for adult wear, suitable for Eid, Puja, weddings and dawat occasions.\nCare with dry clean only and store folded in a cool, dry place to keep the woven work fresh.",
      category: "Sarees",
      attributes: [
        { name: "Color", value: "Red with gold" },
        { name: "Work", value: "Gold-toned woven zari buti" },
        { name: "Border", value: "Wide woven traditional border" },
        { name: "Type", value: "Jamdani saree" },
      ],
      tags: ["jamdani saree", "red saree", "gold zari saree", "festive saree", "wedding saree", "deshi saree"],
      price_hint_bdt: {
        low: 2800,
        high: 6500,
        basis: "Red zari jamdani-style festive sarees often listed in this range",
      },
      confidence: 0.75,
      check_notes: [
        "Check fabric composition: half-silk, cotton or other - not visible in photo",
        "Confirm if blouse piece is included and its length",
        "Confirm saree length and whether pure Jamdani or Jamdani-style weave",
      ],
    },
    bn: {
      title: "সোনালি জরির কাজের লাল জামদানি শাড়ি",
      short_description: "উৎসবের জন্য লাল জামদানি শাড়ি, সোনালি ফুলেল বুটি আর চওড়া বোনা পাড়।",
      description:
        "লাল জমিনে সোনালি ফুলেল বুটি আর চওড়া বোনা পাড়ের জামদানি শাড়ি। নকশার খুঁটিনাটি ছবিতে দেখুন।\nসোনার গয়নার সঙ্গে দারুণ মানায়।\nঈদ, পূজা, বিয়ে আর দাওয়াতের জন্য উপযুক্ত।\nশুধু ড্রাই ক্লিন করুন, ভাঁজ করে ঠান্ডা ও শুকনো জায়গায় রাখুন।",
      attributes: [
        { name: "রং", value: "সোনালির সঙ্গে লাল" },
        { name: "কাজ", value: "সোনালি জরির বুটি" },
        { name: "পাড়", value: "চওড়া বোনা পাড়" },
        { name: "ধরন", value: "জামদানি শাড়ি" },
      ],
      tags: ["জামদানি শাড়ি", "লাল শাড়ি", "জরির শাড়ি", "উৎসবের শাড়ি", "jamdani saree"],
    },
  },
];
