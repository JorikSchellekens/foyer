"use client";

import { useEffect, useRef, useState } from "react";

type Look = { fit: "cover" } | { fit: "contain"; fill: string };

/**
 * The banner strip on a data room's front page.
 *
 * Two kinds of image land here. A wide photo should fill the strip, cropped
 * as needed. But the branding auto-fill imports the site's og:image, which is
 * usually a social card: a logo centred on a plain ~1.9:1 canvas. Cropped to
 * a wide strip, that blows the logo up and cuts it off. So the image's border
 * is sampled once it loads: a near-uniform border means a padded card, shown
 * whole with the strip filled in its background colour; anything else is
 * treated as a photo and covers the strip as before.
 */
export function DataroomBanner({
  src,
  borderColor,
}: {
  src: string;
  borderColor: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [look, setLook] = useState<Look | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const run = () => setLook(analyse(img));
    // A cached image can finish before hydration, so onLoad never fires.
    if (img.complete && img.naturalWidth > 0) run();
    else img.addEventListener("load", run, { once: true });
    return () => img.removeEventListener("load", run);
  }, [src]);

  return (
    <div
      className="h-32 w-full overflow-hidden border-b sm:h-56"
      style={{
        borderColor,
        backgroundColor: look?.fit === "contain" ? look.fill : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        className={`h-full w-full transition-opacity duration-[var(--dur)] ${
          look?.fit === "contain" ? "object-contain" : "object-cover"
        } ${look ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/** Mean border colour, and whether the border is plain enough to extend. */
function analyse(img: HTMLImageElement): Look {
  try {
    const w = 64;
    const h = Math.max(2, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { fit: "cover" };
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const px: [number, number, number][] = [];
    const at = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      px.push([data[i], data[i + 1], data[i + 2]]);
    };
    for (let x = 0; x < w; x++) {
      at(x, 0);
      at(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      at(0, y);
      at(w - 1, y);
    }

    const mean = [0, 1, 2].map(
      (c) => px.reduce((s, p) => s + p[c], 0) / px.length
    );
    // Mean absolute deviation across channels: JPEG noise and soft
    // gradients stay well under this, photos and patterns don't.
    const dev =
      px.reduce(
        (s, p) =>
          s +
          Math.abs(p[0] - mean[0]) +
          Math.abs(p[1] - mean[1]) +
          Math.abs(p[2] - mean[2]),
        0
      ) /
      (px.length * 3);
    if (dev > 8) return { fit: "cover" };
    const [r, g, b] = mean.map(Math.round);
    return { fit: "contain", fill: `rgb(${r} ${g} ${b})` };
  } catch {
    // Unreadable pixels (should not happen: same-origin asset) - keep cover.
    return { fit: "cover" };
  }
}
