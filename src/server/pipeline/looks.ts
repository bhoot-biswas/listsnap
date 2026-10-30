import "server-only";
import type { Look } from "@/lib/schemas/looks";
import type { SceneBrief } from "@/lib/schemas/pipeline";

/**
 * Where each look sets the product, as a scene brief the lifestyle prompt already knows
 * how to use. Props stay in the soft-focus background: the lifestyle prompt already rules
 * out anything that could pass for part of the product, and so does the fidelity check.
 */
const LOOK_SCENES: Record<Look, Pick<SceneBrief, "setting" | "palette">> = {
  eid: {
    setting:
      "on a carved wooden table dressed for Eid, warm lantern light, a brass bowl of dates and a crescent lantern softly out of focus behind",
    palette: ["deep green", "gold", "ivory"],
  },
  boishakh: {
    setting:
      "on a woven shital pati mat for Pohela Boishakh, bright morning light, marigolds and a red-and-white alpana of flowing floral and paisley lines (no animals) softly out of focus behind",
    palette: ["red", "white", "marigold"],
  },
  minimal: {
    setting: "on a plain seamless white surface, bright soft even light, a gentle natural shadow, nothing else",
    palette: ["white", "light grey"],
  },
  outdoor: {
    setting: "on a sunlit wooden bench in a green garden, soft afternoon daylight, leaves softly out of focus behind",
    palette: ["leaf green", "warm wood", "sky blue"],
  },
  wedding: {
    setting:
      "on a richly embroidered silk cushion for a wedding, soft fairy lights and scattered rose petals softly out of focus behind",
    palette: ["maroon", "gold", "blush pink"],
  },
};

/** The look's setting and colours, keeping what the plan said to leave out for this product. */
export function lookBrief(look: Look, planBrief: SceneBrief | null): SceneBrief {
  return { ...LOOK_SCENES[look], avoid: planBrief?.avoid ?? [] };
}
