// Shared canvas shape renderer used by the editor export and the slideshow renderer.
export type ShapeKind = "rect" | "ellipse" | "line";

export type ShapeDrawArgs = {
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
};

export function drawShape(ctx: CanvasRenderingContext2D, s: ShapeDrawArgs) {
  const { shape, x, y, w, h } = s;
  ctx.save();
  ctx.lineWidth = s.strokeWidth || 0;
  if (shape === "line") {
    if (!s.stroke || !s.strokeWidth) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = s.stroke;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (shape === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
  } else {
    const r = Math.max(0, Math.min(s.radius, Math.min(Math.abs(w), Math.abs(h)) / 2));
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke && s.strokeWidth > 0) {
    ctx.strokeStyle = s.stroke;
    ctx.stroke();
  }
  ctx.restore();
}
