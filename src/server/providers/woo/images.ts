import "server-only";

/**
 * Which store images a draft should have. Each image ListSnap uploads is named after its
 * media id, so a later save can tell its own images from ones the seller added in the
 * store, and send only what changed: a photo already there keeps its store image, a new
 * one is uploaded, and an unticked one is left out, which takes it off the product but
 * leaves it in the store's media library.
 */

export interface StoreImage {
  id: number;
  name?: string;
}

export type ImageStep =
  | { kind: "keep"; mediaId: string; id: number }
  | { kind: "upload"; mediaId: string }
  /** An image the seller added in the store; it stays, after ours. */
  | { kind: "theirs"; id: number };

const PREFIX = "listsnap-";

export const imageName = (mediaId: string) => `${PREFIX}${mediaId}`;

/**
 * The images to send, in order: the wanted photos, then the seller's own. Null for a draft
 * saved before images carried names: which of its images are ours is unknown, so they are
 * left as they are rather than uploaded a second time.
 */
export function imagePlan(existing: StoreImage[], wanted: string[]): ImageStep[] | null {
  const ours = new Map<string, number>();
  const theirs: number[] = [];
  for (const img of existing) {
    if (img.name?.startsWith(PREFIX)) ours.set(img.name.slice(PREFIX.length), img.id);
    else theirs.push(img.id);
  }
  if (existing.length && !ours.size) return null;
  return [
    ...wanted.map((mediaId): ImageStep => {
      const id = ours.get(mediaId);
      return id === undefined ? { kind: "upload", mediaId } : { kind: "keep", mediaId, id };
    }),
    ...theirs.map((id): ImageStep => ({ kind: "theirs", id })),
  ];
}
