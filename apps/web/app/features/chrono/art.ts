/** Widths exported for Chronicle plates; thumbnails and the surrounding tunnel keep their smaller cuts. */
export const ART_WIDTHS = [800, 1600, 3840] as const;
export type ArtWidth = typeof ART_WIDTHS[number];

export function artUrl(src: string, width: ArtWidth): string {
  return `${src}-${width === 3840 ? "" : "hd-"}${width}.webp`;
}

export function artSrcSet(src: string): string {
  return ART_WIDTHS.map((width) => `${artUrl(src, width)} ${width}w`).join(", ");
}

export function artSizes(aspect = 1.5): string {
  return `(min-width: 961px) max(100vw, ${560 * aspect}px, calc((100svh - 96px) * ${aspect})), max(100vw, clamp(${460 * aspect}px, ${64 * aspect}vh, ${640 * aspect}px))`;
}

/** Cover-fit needs enough pixels for the cropped dimension too, especially in a portrait window. */
export function artWidth(width: number, height: number, dpr: number, limit: number, aspect = 1.5): ArtWidth | null {
  const supported = ART_WIDTHS.filter((size) => Math.max(size, size / aspect) <= limit);
  const pixels = Math.max(width, height * aspect) * Math.min(2, Math.max(1, dpr || 1));
  return supported.find((size) => size >= pixels) ?? supported.at(-1) ?? null;
}

/** A high-resolution request belongs only to the current plate and can be abandoned on navigation. */
export function loadArtImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const abort = () => {
      image.removeAttribute("src");
      reject(new DOMException("Plate changed", "AbortError"));
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
    void image.decode().then(() => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) { image.removeAttribute("src"); return; }
      resolve(image);
    }, (error: unknown) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}
