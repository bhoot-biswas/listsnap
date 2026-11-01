import { mediaSrcSet, sized } from "@/lib/media-size";

/**
 * A photo from /media at the size it is drawn: the browser picks from the sizes the
 * server keeps, instead of a 2048 px original for a 96 px tile, and loads it only when it
 * nears the screen. `sizes` says how wide it is drawn. Other links (a photo still on the
 * phone, a sample) are shown as they are.
 */
export function MediaImg({
  src,
  sizes,
  eager = false,
  alt,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "srcSet" | "sizes" | "loading"> & {
  src: string;
  sizes: string;
  /** The page's main photo, on the first screen: load it at once. */
  eager?: boolean;
}) {
  const srcSet = mediaSrcSet(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private /media files, sized by the server
    <img
      src={srcSet ? sized(src, 640) : src}
      srcSet={srcSet ?? undefined}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...props}
    />
  );
}
