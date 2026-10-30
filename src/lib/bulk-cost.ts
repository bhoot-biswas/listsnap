/**
 * What a bulk upload will use, shown before it starts. Each photo is one listing, and each
 * listing makes the shop's automatic scenes (Settings) as AI photos. A photo showing
 * several products can make more, so these are the least it will use.
 */
export function bulkCost(input: { photos: number; scenesPerListing: number; imagesLeft: number }) {
  const aiPhotos = input.photos * input.scenesPerListing;
  // listings past the photo limit still get their text; only their photos wait
  const withoutPhotos =
    input.scenesPerListing > 0 && aiPhotos > input.imagesLeft
      ? input.photos - Math.floor(Math.max(0, input.imagesLeft) / input.scenesPerListing)
      : 0;
  return { listings: input.photos, aiPhotos, withoutPhotos };
}
