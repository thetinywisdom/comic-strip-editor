# Shape layers

Add a third layer type — shapes — alongside text and image layers in the editor.

## What you get

- A new "Add shape" button in the artboard toolbar (next to add image / add text), with a small menu to pick Rectangle, Ellipse (round), or Line.
- New shapes are dropped in the middle of the artboard at a default size and selected right away.
- Shapes behave exactly like existing layers: drag to move, 8-direction resize, multi-select, marquee select, align/distribute, duplicate, delete, undo/redo, rename in the layer tree, and off-artboard positioning (clipped on export).
- Properties panel for a selected shape:
  - Pos (X/Y) and Size (W/H) in pixels, same as image layers.
  - Fill: swatches from the existing palette (Black, White, Yellow, Orange, Blue, Green) plus a "None" option.
  - Stroke: same palette plus "None", with a stroke width input in px.
  - Corner radius input for rectangles only.
  - Line has stroke + width only (no fill, no radius); it renders as a horizontal line across the layer box and can be resized/rotated-free by dragging the box edges (length = box width, thickness = stroke width).
- Shapes render identically on canvas preview and in the exported JPEG.

## Technical notes

All in `src/pages/Editor.tsx` plus the standalone renderer `src/lib/slideRender.ts` (used by the project slideshow/thumbnail).

- Extend the layer type: `kind?: "text" | "image" | "shape"`, plus `shape?: "rect" | "ellipse" | "line"`, `fill?: string | null`, `stroke?: string | null`, `strokeWidth?: number`, `radiusPx?: number`.
- Canvas preview: render shapes as absolutely positioned divs (rect = `div` with border/background/border-radius, ellipse = `rounded-full`, line = a centered div of `strokeWidth` height with background = stroke color). Reuse the existing `onPointerDown` drag and resize-handle machinery unchanged.
- Export (`renderImageToBlob` in Editor and `renderSlideToDataUrl` in `slideRender.ts`): add a `kind === "shape"` branch before the text branch using `ctx.fillRect` / `roundRect` / `ellipse` / `moveTo+lineTo`, honoring fill, stroke, strokeWidth.
- Layer tree: add a Square icon for shape layers; name falls back to the shape type.
- Double-click-to-fit and inline text editing stay text-only; crop stays image-only.
- Persistence needs no schema change — shape fields ride along in the existing project JSON.
