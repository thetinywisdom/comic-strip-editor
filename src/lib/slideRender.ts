// Standalone slide renderer used by the project slideshow (mirrors the editor's
// canvas export logic).
import tinywisdomSvgRaw from "@/assets/watermarks/tinywisdom.svg?raw";
import iconmarkSvgRaw from "@/assets/watermarks/iconmark.svg?raw";
import { drawShape, type ShapeKind } from "@/lib/drawShape";

const WATERMARK_TOP = { width: 404, height: 49, offset: 57, hOffset: 150 };
const WATERMARK_BOTTOM = { width: 75, height: 79, offset: 40, hOffset: 150 };
const LINE_HEIGHT = 1.5;

type Align = "left" | "center" | "right";

export type RenderableSlide = {
  id: string;
  url?: string;
  width: number;
  height: number;
  bgColor: string;
  imageScalePct?: number;
  imageOffsetXPct?: number;
  imageOffsetYPct?: number;
  layers: {
    text: string;
    color: string;
    align: Align;
    fontSizePx: number;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct?: number;
    kind?: "text" | "image" | "shape";
    src?: string;
    shape?: ShapeKind;
    fill?: string | null;
    stroke?: string | null;
    strokeWidth?: number;
    radiusPx?: number;
    rotation?: number;
  }[];
  watermarkTop: { align: Align; color: string };
  watermarkBottom: { align: Align; color: string };
};

const watermarkDataUrl = (svg: string, color: string) => {
  const recolored = svg
    .split('fill="#1A1A1A"').join(`fill="${color}"`)
    .split('fill="#1a1a1a"').join(`fill="${color}"`)
    .split('fill="#FFFEFC"').join(`fill="${color}"`);
  return `data:image/svg+xml;utf8,${encodeURIComponent(recolored)}`;
};

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("image load failed"));
    i.src = src;
  });

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

const watermarkX = (canvasWidth: number, markWidth: number, sideOffset: number, align: Align) => {
  if (align === "center") return (canvasWidth - markWidth) / 2;
  if (align === "right") return canvasWidth - markWidth - sideOffset;
  return sideOffset;
};

export async function renderSlideToDataUrl(img: RenderableSlide): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = img.bgColor || "#FFFFFF";
  ctx.fillRect(0, 0, img.width, img.height);

  if (img.url) {
    try {
      const el = await loadImg(img.url);
      const scale = (img.imageScalePct ?? 100) / 100;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const offX = ((img.imageOffsetXPct ?? 0) / 100) * img.width;
      const offY = ((img.imageOffsetYPct ?? 0) / 100) * img.height;
      ctx.drawImage(el, (img.width - dw) / 2 + offX, (img.height - dh) / 2 + offY, dw, dh);
    } catch {
      /* keep background only */
    }
  }

  ctx.textBaseline = "alphabetic";
  for (const l of img.layers ?? []) {
    const rot = l.rotation ?? 0;
    ctx.save();
    if (rot) {
      const cx = ((l.xPct + l.widthPct / 2) / 100) * img.width;
      const cy = ((l.yPct + (l.heightPct ?? 0) / 2) / 100) * img.height;
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    if (l.kind === "shape") {
      drawShape(ctx, {
        shape: l.shape ?? "rect",
        x: (l.xPct / 100) * img.width,
        y: (l.yPct / 100) * img.height,
        w: (l.widthPct / 100) * img.width,
        h: ((l.heightPct ?? 0) / 100) * img.height,
        fill: l.fill ?? null,
        stroke: l.stroke ?? null,
        strokeWidth: l.strokeWidth ?? 0,
        radius: l.radiusPx ?? 0,
      });
      ctx.restore();
      continue;
    }
    if (l.kind === "image") {
      if (!l.src) { ctx.restore(); continue; }
      try {
        const el = await loadImg(l.src);
        ctx.drawImage(
          el,
          (l.xPct / 100) * img.width,
          (l.yPct / 100) * img.height,
          (l.widthPct / 100) * img.width,
          ((l.heightPct ?? 0) / 100) * img.height
        );
      } catch {
        /* skip */
      }
      ctx.restore();
      continue;
    }
    ctx.font = `${l.fontSizePx}px "Comico", system-ui`;
    ctx.fillStyle = l.color;
    ctx.textAlign = l.align;
    const x = (l.xPct / 100) * img.width;
    const y = (l.yPct / 100) * img.height;
    const maxWidth = (l.widthPct / 100) * img.width;
    const lineH = l.fontSizePx * LINE_HEIGHT;
    const m = ctx.measureText("Hg");
    const asc = m.fontBoundingBoxAscent ?? l.fontSizePx * 0.8;
    const desc = m.fontBoundingBoxDescent ?? l.fontSizePx * 0.2;
    const baseOffset = (lineH - (asc + desc)) / 2 + asc;
    wrapLines(ctx, l.text, maxWidth).forEach((line, i) => {
      const tx =
        l.align === "center" ? x + maxWidth / 2 : l.align === "right" ? x + maxWidth : x;
      ctx.fillText(line, tx, y + i * lineH + baseOffset);
    });
    ctx.restore();
  }

  try {
  if (img.watermarkTop) {
    const topMark = await loadImg(watermarkDataUrl(tinywisdomSvgRaw, img.watermarkTop.color));
    ctx.drawImage(
      topMark,
      watermarkX(img.width, WATERMARK_TOP.width, WATERMARK_TOP.hOffset, img.watermarkTop.align),
      WATERMARK_TOP.offset,
      WATERMARK_TOP.width,
      WATERMARK_TOP.height
    );
  }
  if (img.watermarkBottom) {
    const bottomMark = await loadImg(
      watermarkDataUrl(iconmarkSvgRaw, img.watermarkBottom.color)
    );
    ctx.drawImage(
      bottomMark,
      watermarkX(
        img.width,
        WATERMARK_BOTTOM.width,
        WATERMARK_BOTTOM.hOffset,
        img.watermarkBottom.align
      ),
      img.height - WATERMARK_BOTTOM.offset - WATERMARK_BOTTOM.height,
      WATERMARK_BOTTOM.width,
      WATERMARK_BOTTOM.height
    );
  }
  } catch {
    /* watermarks are optional */
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function renderProjectSlides(slides: RenderableSlide[]): Promise<string[]> {
  try {
    await document.fonts.load('16px "Comico"');
    await document.fonts.ready;
  } catch {
    /* font optional */
  }
  const out: string[] = [];
  for (const s of slides) out.push(await renderSlideToDataUrl(s));
  return out;
}
