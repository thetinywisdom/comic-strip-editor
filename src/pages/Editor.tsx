import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Trash2, Copy, Plus, Minus, Upload, FolderUp, Download, FilePlus, ChevronDown, ArrowLeft, AlignLeft, AlignCenter, AlignRight, AlignHorizontalDistributeStart, AlignHorizontalDistributeCenter, AlignHorizontalDistributeEnd, AlignVerticalDistributeStart, AlignVerticalDistributeCenter, AlignVerticalDistributeEnd, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Lock, Unlock, ImagePlus, Image as ImageIcon, Type, Square, Circle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import tinywisdomSvgRaw from "@/assets/watermarks/tinywisdom.svg?raw";
import iconmarkSvgRaw from "@/assets/watermarks/iconmark.svg?raw";
import logotypeAsset from "@/assets/logotype.svg.asset.json";
import { saveLocal } from "@/lib/localSave";
import { drawShape, type ShapeKind } from "@/lib/drawShape";
import {
  downloadAsset,
  getProject,
  saveProject,
  serializeProject,
  type ProjectData,
} from "@/lib/projects";

// Brand SVGs — recolored at runtime by swapping the baked-in fill color.
const WATERMARK_TOP_SVG = tinywisdomSvgRaw;
const WATERMARK_BOTTOM_SVG = iconmarkSvgRaw;

// Native SVG dimensions (used to preserve aspect ratio in the source image).
const WATERMARK_TOP = { width: 404, height: 49, offset: 57, hOffset: 150 };
const WATERMARK_BOTTOM = { width: 75, height: 79, offset: 40, hOffset: 150 };

const watermarkDataUrl = (svg: string, color: string) => {
  const recolored = svg
    .split('fill="#1A1A1A"').join(`fill="${color}"`)
    .split('fill="#1a1a1a"').join(`fill="${color}"`)
    .split('fill="#FFFEFC"').join(`fill="${color}"`);
  return `data:image/svg+xml;utf8,${encodeURIComponent(recolored)}`;
};

type WatermarkColor = "#2B2C2E" | "#FFFFFF" | "#FECC41";

const WATERMARK_COLORS: { name: string; value: WatermarkColor }[] = [
  { name: "Black", value: "#2B2C2E" },
  { name: "White", value: "#FFFFFF" },
  { name: "Yellow", value: "#FECC41" },
];

type ZoomMode = "fit-height" | "fit-width" | string;

const ZOOM_OPTIONS: { value: ZoomMode; label: string }[] = [
  { value: "fit-height", label: "Fit height" },
  { value: "fit-width", label: "Fit width" },
  { value: "25", label: "25%" },
  { value: "50", label: "50%" },
  { value: "100", label: "100%" },
  { value: "200", label: "200%" },
];

const sortByName = <T extends { name: string }>(arr: T[]) =>
  [...arr].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

const COLORS = [
  { name: "Black", value: "#2B2C2E" },
  { name: "White", value: "#FFFFFF" },
  { name: "Yellow", value: "#FECC41" },
  { name: "Orange", value: "#F26025" },
  { name: "Blue", value: "#1B7FEA" },
  { name: "Green", value: "#1B8186" },
] as const;


type TextAlign = "left" | "center" | "right";

type TextLayer = {
  id: string;
  text: string;
  xPct: number; // top-left X as % of image width
  yPct: number; // top-left Y as % of image height
  widthPct: number; // box width as % of image width
  heightPct: number; // box height as % of image height
  fontSizePx: number; // absolute pixels on source image
  color: string;
  align: TextAlign;
  /** "text" (default), "image" for uploaded image layers, or "shape" */
  kind?: "text" | "image" | "shape";
  /** data URL for image layers */
  src?: string;
  /** display name for image/shape layers */
  name?: string;
  /** shape layers */
  shape?: ShapeKind;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  radiusPx?: number;
  /** clockwise rotation in degrees around the layer box center */
  rotation?: number;
};


export type { ShapeKind };

const SHAPE_LABEL: Record<ShapeKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
};


type LayerTransform = Partial<Pick<TextLayer, "xPct" | "yPct" | "widthPct" | "heightPct" | "rotation">>;

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const LINE_HEIGHT = 1.5;

// Greedy word-wrap respecting explicit newlines. Uses ctx.measureText so it
// matches what canvas will render.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para === "") {
      out.push("");
      continue;
    }
    const words = para.split(/(\s+)/); // keep whitespace tokens
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width > maxWidth && line.trim() !== "") {
        out.push(line.replace(/\s+$/, ""));
        line = w.replace(/^\s+/, "");
      } else {
        line = test;
      }
    }
    if (line !== "") out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

type WatermarkSettings = { align: TextAlign; color: WatermarkColor };

type EditorImage = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  layers: TextLayer[];
  watermarkTop: WatermarkSettings;
  watermarkBottom: WatermarkSettings;
  bgColor: string;
  imageScalePct: number; // image size as % of original (canvas stays original size)
  imageOffsetXPct: number; // image translation as % of canvas width (0 = centered)
  imageOffsetYPct: number; // image translation as % of canvas height (0 = centered)
  positionLocked: boolean; // if true, image cannot be dragged on the canvas
};

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

const newId = () => Math.random().toString(36).slice(2, 10);

async function loadImage(file: File): Promise<EditorImage> {
  // Read as data URL so state can be persisted to IndexedDB and survive
  // accidental page reloads / back-navigation on iPad.
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read " + file.name));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load " + file.name));
    img.src = url;
  });
  return {
    id: newId(),
    name: file.name,
    url,
    width: img.naturalWidth,
    height: img.naturalHeight,
    layers: [],
    watermarkTop: { align: "center", color: "#2B2C2E" },
    watermarkBottom: { align: "center", color: "#2B2C2E" },
    bgColor: "#FFFFFF",
    imageScalePct: 100,
    imageOffsetXPct: 0,
    imageOffsetYPct: 0,
    positionLocked: true,
  };
}

function createBlankSlide(index: number): EditorImage {
  return {
    id: newId(),
    name: `slide-${index}.jpg`,
    url: "",
    width: 2160,
    height: 2700,
    layers: [],
    watermarkTop: { align: "center", color: "#2B2C2E" },
    watermarkBottom: { align: "center", color: "#2B2C2E" },
    bgColor: "#EFEEEA",
    imageScalePct: 100,
    imageOffsetXPct: 0,
    imageOffsetYPct: 0,
    positionLocked: true,
  };
}



// Horizontal position for a watermark on the source image (top-left X in px).
const watermarkX = (canvasWidth: number, markWidth: number, sideOffset: number, align: TextAlign) => {
  if (align === "left") return sideOffset;
  if (align === "right") return canvasWidth - sideOffset - markWidth;
  return (canvasWidth - markWidth) / 2;
};


type HistorySnapshot = {
  images: EditorImage[];
  selectedId: string | null;
  selectedLayerId: string | null;
};

const Editor = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const userId = "local";

  const [title, setTitle] = useState("Untitled project");
  const [projectLoading, setProjectLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<EditorImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const setSelectedLayerId = useCallback((id: string | null) => {
    setSelectedLayerIds(id ? [id] : []);
  }, []);
  const toggleLayerSelection = useCallback((id: string) => {
    setSelectedLayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>("fit-height");
  // Active placement tool: click on the canvas to drop the new layer there.
  const [tool, setTool] = useState<null | "rect" | "ellipse" | "line" | "text">(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const layerImageInputRef = useRef<HTMLInputElement>(null);

  const selected = images.find((i) => i.id === selectedId) ?? null;

  // Multiply the current zoom by a factor, converting fit modes to an exact % first.
  const zoomBy = (factor: number) => {
    if (!selected) return;
    let pct: number;
    const wrap = canvasWrapRef.current;
    if (zoom === "fit-height") {
      pct = wrap ? (wrap.clientHeight / selected.height) * 100 : 100;
    } else if (zoom === "fit-width") {
      pct = wrap ? (wrap.clientWidth / selected.width) * 100 : 100;
    } else {
      pct = Number(zoom) || 100;
    }
    const next = Math.min(400, Math.max(5, Math.round(pct * factor)));
    setZoom(String(next));
  };
  const selectedLayer = selected?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // ---------- Undo / redo ----------
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const stateRef = useRef<HistorySnapshot>({ images, selectedId, selectedLayerId });
  useEffect(() => {
    stateRef.current = { images, selectedId, selectedLayerId };
  }, [images, selectedId, selectedLayerId]);

  const commit = useCallback(() => {
    undoStackRef.current.push(stateRef.current);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const applySnapshot = (s: HistorySnapshot) => {
    setImages(s.images);
    setSelectedId(s.selectedId);
    setSelectedLayerId(s.selectedLayerId);
  };

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(stateRef.current);
    applySnapshot(prev);
  }, []);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(stateRef.current);
    applySnapshot(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isEditing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement?.getAttribute("contenteditable") === "true";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !isEditing && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && !isEditing && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (!isEditing && !mod && !e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setTool((t) => (t === "rect" ? null : "rect"));
        return;
      }
      if (!isEditing && !mod && !e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setTool((t) => (t === "text" ? null : "text"));
        return;
      }
      if (!isEditing && e.key === "Escape") {
        setTool(null);
        return;
      }
      if (!isEditing && !mod && selected && selectedLayerIds.length && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        const dxPct = (dx / selected.width) * 100;
        const dyPct = (dy / selected.height) * 100;
        commit();
        for (const id of selectedLayerIds) {
          const layer = selected.layers.find((l) => l.id === id);
          if (layer) updateLayer(id, { xPct: layer.xPct + dxPct, yPct: layer.yPct + dyPct });
        }
        return;
      }
      if (!isEditing && (e.key === "Backspace" || e.key === "Delete") && selectedLayerIds.length) {
        e.preventDefault();
        deleteLayers(selectedLayerIds);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedLayerIds, selectedId, images, selected, undo, redo, commit]);

  // ---------- Project persistence (cloud + local safety net) ----------
  const hydratedRef = useRef(false);
  const localKey = projectId ? `project-${projectId}` : undefined;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    hydratedRef.current = false;
    (async () => {
      try {
        const row = await getProject(projectId);
        if (cancelled) return;
        if (!row) {
          toast.error("Project not found");
          navigate("/", { replace: true });
          return;
        }
        setTitle(row.title);
        const stored = (row.data ?? {}) as unknown as ProjectData;
        const slides = (stored.images ?? []) as unknown as EditorImage[];

        // Show artboards, layers and text immediately; pictures stream in after.
        setImages(slides);
        setSelectedId(stored.selectedId ?? slides[0]?.id ?? null);
        setSelectedLayerId(stored.selectedLayerId ?? null);
        setProjectLoading(false);

        type Pending = { slideId: string; layerId?: string; path: string };
        const pending: Pending[] = [];
        for (const slide of stored.images ?? []) {
          if (slide.storagePath) pending.push({ slideId: slide.id, path: slide.storagePath });
          for (const layer of slide.layers ?? []) {
            if (layer.srcPath)
              pending.push({ slideId: slide.id, layerId: layer.id, path: layer.srcPath });
          }
        }

        await Promise.all(
          pending.map(async (job) => {
            const url = await downloadAsset(job.path);
            if (cancelled || !url) return;
            setImages((prev) =>
              prev.map((img) => {
                if (img.id !== job.slideId) return img;
                if (!job.layerId) return { ...img, url };
                return {
                  ...img,
                  layers: img.layers.map((l) => (l.id === job.layerId ? { ...l, src: url } : l)),
                };
              })
            );
          })
        );
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not open project");
      } finally {
        if (!cancelled) {
          setProjectLoading(false);
          hydratedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, navigate]);

  // Small preview used on the projects grid.
  const buildThumbnail = useCallback(async (img: EditorImage | undefined) => {
    if (!img) return null;
    try {
      const blob = await renderImageToBlob(img);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      const scale = 400 / bitmap.width;
      canvas.width = 400;
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.6);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !projectId || !userId) return;
    const t = setTimeout(async () => {
      if (localKey) saveLocal({ images, selectedId, selectedLayerId }, localKey);
      setSaving(true);
      try {
        const data = await serializeProject(userId, projectId, {
          images: images as unknown as ProjectData["images"],
          selectedId,
          selectedLayerId,
        });
        const thumbnail = await buildThumbnail(images[0]);
        await saveProject(projectId, { data, thumbnail });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save project");
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selectedId, selectedLayerId, projectId, userId, localKey]);




  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => ACCEPTED.includes(f.type));
    if (files.length === 0) return;
    const loaded = await Promise.all(files.map(loadImage));
    commit();
    setImages((prev) => {
      const next = sortByName([...prev, ...loaded]);
      if (!selectedId && next.length > 0) setSelectedId(next[0].id);
      return next;
    });
  }, [selectedId, commit]);

  const addBlankSlide = useCallback(() => {
    commit();
    setImages((prev) => {
      const slide = createBlankSlide(prev.length + 1);
      const next = [...prev, slide];
      setSelectedId(slide.id);
      setSelectedLayerId(null);
      return next;
    });
  }, [commit]);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameLayerDraft, setRenameLayerDraft] = useState("");
  const [expandedSlides, setExpandedSlides] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragLayer, setDragLayer] = useState<{ imgId: string; index: number } | null>(null);
  const [dragOverLayer, setDragOverLayer] = useState<{ imgId: string; index: number } | null>(null);


  const commitRename = (id: string) => {
    const next = renameDraft.trim();
    if (next) {
      setImages((prev) => prev.map((img) => (img.id === id ? { ...img, name: next } : img)));
    }
    setRenamingId(null);
  };

  const commitLayerRename = (imgId: string, layerId: string) => {
    const next = renameLayerDraft.trim();
    if (!next) {
      setRenamingLayerId(null);
      return;
    }
    setImages((prev) =>
      prev.map((img) =>
        img.id !== imgId
          ? img
          : {
              ...img,
              layers: img.layers.map((l) =>
                l.id !== layerId ? l : { ...l, name: next }
              ),
            }
      )
    );
    setRenamingLayerId(null);
  };

  const reorderImages = useCallback((from: number, to: number) => {
    if (from === to) return;
    commit();
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, [commit]);

  // Reorders layers within an artboard (list order = stacking order).
  const reorderLayers = useCallback((imgId: string, from: number, to: number) => {
    if (from === to) return;
    commit();
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== imgId) return img;
        const layers = [...img.layers];
        const [moved] = layers.splice(from, 1);
        layers.splice(to, 0, moved);
        return { ...img, layers };
      })
    );
  }, [commit]);



  const updateLayer = (layerId: string, patch: Partial<TextLayer>) => {
    if (!selected) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id !== selected.id
          ? img
          : { ...img, layers: img.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
      )
    );
  };

  // Bakes a crop (fractions of the layer's current box) into the image layer's source.
  const cropImageLayer = async (
    layerId: string,
    r: { x: number; y: number; w: number; h: number }
  ) => {
    if (!selected) return;
    const layer = selected.layers.find((l) => l.id === layerId);
    if (!layer || layer.kind !== "image" || !layer.src) return;
    if (r.w >= 0.999 && r.h >= 0.999 && r.x <= 0.001 && r.y <= 0.001) return;
    try {
      const el = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("image load failed"));
        i.src = layer.src!;
      });
      const sw = el.naturalWidth || 1;
      const sh = el.naturalHeight || 1;
      const cw = Math.max(1, Math.round(r.w * sw));
      const ch = Math.max(1, Math.round(r.h * sh));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el, r.x * sw, r.y * sh, r.w * sw, r.h * sh, 0, 0, cw, ch);
      const src = canvas.toDataURL("image/png");
      commit();
      updateLayer(layerId, {
        src,
        xPct: layer.xPct + r.x * layer.widthPct,
        yPct: layer.yPct + r.y * layer.heightPct,
        widthPct: layer.widthPct * r.w,
        heightPct: layer.heightPct * r.h,
      });
    } catch {
      toast.error("Could not crop this image");
    }
  };

  const addShapeLayer = (
    shape: ShapeKind,
    at?: { xPct: number; yPct: number; widthPct?: number; heightPct?: number }
  ) => {
    if (!selected) return;
    const widthPct = at?.widthPct ?? 40;
    const heightPct = at?.heightPct ?? (shape === "line" ? 2 : 30);
    const layer: TextLayer = {
      id: newId(),
      kind: "shape",
      shape,
      text: "",
      name: SHAPE_LABEL[shape],
      xPct: at ? at.xPct : (100 - widthPct) / 2,
      yPct: at ? at.yPct : (100 - heightPct) / 2,
      widthPct,
      heightPct,
      fontSizePx: 56,
      color: "#2B2C2E",
      align: "left",
      fill: shape === "line" ? null : "#2B2C2E",
      stroke: shape === "line" ? "#2B2C2E" : null,
      strokeWidth: shape === "line" ? 8 : 4,
      radiusPx: 0,
    };
    commit();
    setImages((prev) =>
      prev.map((img) => (img.id !== selected.id ? img : { ...img, layers: [...img.layers, layer] }))
    );
    setSelectedLayerId(layer.id);
  };


  const addLayer = (at?: {
    xPct: number;
    yPct: number;
    widthPct?: number;
    heightPct?: number;
    center?: boolean;
  }) => {
    if (!selected) return;
    const text = "Your text";
    const fontSizePx = 56;

    // Default box hugs the text instead of using a fixed width.
    let widthPct = at?.widthPct;
    let heightPct = at?.heightPct;
    if (widthPct == null || heightPct == null) {
      const ctx = document.createElement("canvas").getContext("2d");
      let textW = fontSizePx * 5;
      if (ctx) {
        ctx.font = `${fontSizePx}px "Comico", system-ui`;
        textW = Math.max(1, ctx.measureText(text).width);
      }
      widthPct = widthPct ?? Math.min(((textW + 2) / selected.width) * 100, 100);
      heightPct = heightPct ?? ((fontSizePx * LINE_HEIGHT) / selected.height) * 100;
    }

    const layer: TextLayer = {
      id: newId(),
      text,
      xPct: at ? (at.center ? at.xPct - widthPct / 2 : at.xPct) : (100 - widthPct) / 2,
      yPct: at ? (at.center ? at.yPct - heightPct / 2 : at.yPct) : (100 - heightPct) / 2,
      widthPct,
      heightPct,
      fontSizePx,
      color: "#2B2C2E",
      align: "left",
    };
    commit();
    setImages((prev) =>
      prev.map((img) => (img.id !== selected.id ? img : { ...img, layers: [...img.layers, layer] }))
    );
    setSelectedLayerId(layer.id);
  };


  // Adds an uploaded image (jpg/png/svg) as a movable, resizable layer.
  const addImageLayers = async (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return;
    const slide = selected;
    const created: TextLayer[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (!src) continue;
      const el = new Image();
      const ok = await new Promise<boolean>((resolve) => {
        el.onload = () => resolve(true);
        el.onerror = () => resolve(false);
        el.src = src;
      });
      const natW = ok && el.naturalWidth ? el.naturalWidth : slide.width / 2;
      const natH = ok && el.naturalHeight ? el.naturalHeight : slide.height / 2;
      // Fit inside 50% of the canvas, preserving aspect ratio.
      const scale = Math.min((slide.width * 0.5) / natW, (slide.height * 0.5) / natH, 1);
      const widthPct = ((natW * scale) / slide.width) * 100;
      const heightPct = ((natH * scale) / slide.height) * 100;
      created.push({
        id: newId(),
        kind: "image",
        src,
        name: file.name,
        text: "",
        xPct: (100 - widthPct) / 2,
        yPct: (100 - heightPct) / 2,
        widthPct,
        heightPct,
        fontSizePx: 56,
        color: "#2B2C2E",
        align: "left",
      });
    }
    if (created.length === 0) return;
    commit();
    setImages((prev) =>
      prev.map((img) => (img.id !== slide.id ? img : { ...img, layers: [...img.layers, ...created] }))
    );
    setSelectedLayerId(created[created.length - 1].id);
  };



  const deleteLayer = (layerId: string) => {
    if (!selected) return;
    commit();
    setImages((prev) =>
      prev.map((img) =>
        img.id !== selected.id ? img : { ...img, layers: img.layers.filter((l) => l.id !== layerId) }
      )
    );
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  };

  const deleteLayers = (ids: string[]) => {
    if (!selected || ids.length === 0) return;
    commit();
    const set = new Set(ids);
    setImages((prev) =>
      prev.map((img) =>
        img.id !== selected.id ? img : { ...img, layers: img.layers.filter((l) => !set.has(l.id)) }
      )
    );
    setSelectedLayerIds((prev) => prev.filter((id) => !set.has(id)));
  };

  // Moves several layers at once (used by multi-select drag).
  const moveLayers = (moves: { id: string; xPct: number; yPct: number }[]) => {
    if (!selected) return;
    const map = new Map(moves.map((m) => [m.id, m]));
    setImages((prev) =>
      prev.map((img) =>
        img.id !== selected.id
          ? img
          : {
              ...img,
              layers: img.layers.map((l) => {
                const m = map.get(l.id);
                return m ? { ...l, xPct: m.xPct, yPct: m.yPct } : l;
              }),
            }
      )
    );
  };

  // Aligns/distributes the current multi-selection relative to its own bounding box.
  const alignSelection = (
    mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "hdist" | "vdist"
  ) => {
    if (!selected || selectedLayerIds.length < 2) return;
    const sel = selected.layers.filter((l) => selectedLayerIds.includes(l.id));
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((l) => l.xPct));
    const maxX = Math.max(...sel.map((l) => l.xPct + l.widthPct));
    const minY = Math.min(...sel.map((l) => l.yPct));
    const maxY = Math.max(...sel.map((l) => l.yPct + l.heightPct));
    let moves: { id: string; xPct: number; yPct: number }[] = [];

    if (mode === "hdist" || mode === "vdist") {
      const horiz = mode === "hdist";
      const sorted = [...sel].sort((a, b) => (horiz ? a.xPct - b.xPct : a.yPct - b.yPct));
      const span = horiz ? maxX - minX : maxY - minY;
      const total = sorted.reduce((s, l) => s + (horiz ? l.widthPct : l.heightPct), 0);
      const gap = (span - total) / (sorted.length - 1);
      let cursor = horiz ? minX : minY;
      moves = sorted.map((l) => {
        const pos = cursor;
        cursor += (horiz ? l.widthPct : l.heightPct) + gap;
        return horiz ? { id: l.id, xPct: pos, yPct: l.yPct } : { id: l.id, xPct: l.xPct, yPct: pos };
      });
    } else {
      moves = sel.map((l) => {
        let { xPct, yPct } = l;
        if (mode === "left") xPct = minX;
        if (mode === "right") xPct = maxX - l.widthPct;
        if (mode === "hcenter") xPct = (minX + maxX) / 2 - l.widthPct / 2;
        if (mode === "top") yPct = minY;
        if (mode === "bottom") yPct = maxY - l.heightPct;
        if (mode === "vcenter") yPct = (minY + maxY) / 2 - l.heightPct / 2;
        return { id: l.id, xPct, yPct };
      });
    }
    commit();
    moveLayers(moves);
  };


  const duplicateLayer = (layerId: string, opts?: { offset?: boolean; select?: boolean }): string | null => {
    if (!selected) return null;
    const layer = selected.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    const offset = opts?.offset ?? true;
    const select = opts?.select ?? true;
    const dup: TextLayer = {
      ...layer,
      id: newId(),
      xPct: offset ? Math.min(90, layer.xPct + 5) : layer.xPct,
      yPct: offset ? Math.min(90, layer.yPct + 5) : layer.yPct,
    };
    commit();
    setImages((prev) =>
      prev.map((img) =>
        img.id !== selected.id ? img : { ...img, layers: [...img.layers, dup] }
      )
    );
    if (select) setSelectedLayerId(dup.id);
    return dup.id;

  };

  const deleteImage = (id: string) => {
    commit();
    setImages((prev) => {
      // Keep the blob URL alive so undo can restore it; cleanup happens on unmount.
      const next = prev.filter((i) => i.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };


  const renderImageToBlob = async (img: EditorImage): Promise<Blob> => {
    const loadDataImg = (src: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("watermark load failed"));
        i.src = src;
      });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = img.bgColor;
    ctx.fillRect(0, 0, img.width, img.height);
    if (img.url) {
      const el = new Image();
      el.src = img.url;
      await new Promise<void>((res) => {
        if (el.complete) res();
        else el.onload = () => res();
      });
      const scale = (img.imageScalePct ?? 100) / 100;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const offX = ((img.imageOffsetXPct ?? 0) / 100) * img.width;
      const offY = ((img.imageOffsetYPct ?? 0) / 100) * img.height;
      ctx.drawImage(el, (img.width - dw) / 2 + offX, (img.height - dh) / 2 + offY, dw, dh);
    }
    ctx.textBaseline = "alphabetic";
    const drawLayer = async (l: TextLayer) => {
      if (l.kind === "shape") {
        drawShape(ctx, {
          shape: l.shape ?? "rect",
          x: (l.xPct / 100) * img.width,
          y: (l.yPct / 100) * img.height,
          w: (l.widthPct / 100) * img.width,
          h: (l.heightPct / 100) * img.height,
          fill: l.fill ?? null,
          stroke: l.stroke ?? null,
          strokeWidth: l.strokeWidth ?? 0,
          radius: l.radiusPx ?? 0,
        });
        return;
      }
      if (l.kind === "image") {
        if (!l.src) return;
        try {
          const el = await loadDataImg(l.src);
          ctx.drawImage(
            el,
            (l.xPct / 100) * img.width,
            (l.yPct / 100) * img.height,
            (l.widthPct / 100) * img.width,
            (l.heightPct / 100) * img.height,
          );
        } catch {
          /* skip broken image layer */
        }
        return;
      }
      const fontPx = l.fontSizePx;
      ctx.font = `${fontPx}px "Comico", system-ui`;
      ctx.fillStyle = l.color;
      ctx.textAlign = l.align;
      const x = (l.xPct / 100) * img.width;
      const y = (l.yPct / 100) * img.height;
      const maxWidth = (l.widthPct / 100) * img.width;
      const lines = wrapLines(ctx, l.text, maxWidth);
      const lineH = fontPx * LINE_HEIGHT;
      // Match CSS line-box positioning: half-leading above the ascent.
      const m = ctx.measureText("Hg");
      const asc = m.fontBoundingBoxAscent ?? fontPx * 0.8;
      const desc = m.fontBoundingBoxDescent ?? fontPx * 0.2;
      const baseOffset = (lineH - (asc + desc)) / 2 + asc;
      lines.forEach((line, i) => {
        const tx =
          l.align === "center"
            ? x + maxWidth / 2
            : l.align === "right"
            ? x + maxWidth
            : x;
        ctx.fillText(line, tx, y + i * lineH + baseOffset);
      });
    };
    for (const l of img.layers) {
      const rot = l.rotation ?? 0;
      ctx.save();
      if (rot) {
        const cx = ((l.xPct + l.widthPct / 2) / 100) * img.width;
        const cy = ((l.yPct + l.heightPct / 2) / 100) * img.height;
        ctx.translate(cx, cy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      await drawLayer(l);
      ctx.restore();
    }

    const topMark = await loadDataImg(watermarkDataUrl(WATERMARK_TOP_SVG, img.watermarkTop.color));
    const bottomMark = await loadDataImg(watermarkDataUrl(WATERMARK_BOTTOM_SVG, img.watermarkBottom.color));
    ctx.drawImage(
      topMark,
      watermarkX(img.width, WATERMARK_TOP.width, WATERMARK_TOP.hOffset, img.watermarkTop.align),
      WATERMARK_TOP.offset,
      WATERMARK_TOP.width,
      WATERMARK_TOP.height,
    );
    ctx.drawImage(
      bottomMark,
      watermarkX(img.width, WATERMARK_BOTTOM.width, WATERMARK_BOTTOM.hOffset, img.watermarkBottom.align),
      img.height - WATERMARK_BOTTOM.offset - WATERMARK_BOTTOM.height,
      WATERMARK_BOTTOM.width,
      WATERMARK_BOTTOM.height,
    );
    return await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.92)
    );
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadImage = async (img: EditorImage) => {
    await document.fonts.load('16px "Comico"');
    await document.fonts.ready;
    const blob = await renderImageToBlob(img);
    const base = img.name.replace(/\.[^.]+$/, "");
    triggerDownload(blob, `${base}.jpg`);
  };

  const downloadAll = async () => {
    if (images.length === 0) return;
    setExporting(true);
    try {
      await document.fonts.load('16px "Comico"');
      await document.fonts.ready;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const blob = await renderImageToBlob(img);
        const base = img.name.replace(/\.[^.]+$/, "");
        triggerDownload(blob, `${base}.jpg`);
        await new Promise((r) => setTimeout(r, 150));
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="border-b border-border bg-background sticky top-0 z-30">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")} aria-label="Back to projects">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <img src={logotypeAsset.url} alt="The Tiny Wisdom" className="h-7 w-auto hidden sm:block" />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim() || "Untitled project";
                setTitle(next);
                if (projectId) saveProject(projectId, { title: next }).catch(() => toast.error("Could not rename project"));
              }}
              className="h-8 w-40 md:w-56 border-transparent hover:border-input focus-visible:border-input text-sm"
              aria-label="Project title"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {projectLoading ? "Loading…" : saving ? "Saving…" : "Saved"}
            </span>
            <Button size="sm" onClick={downloadAll} disabled={images.length === 0 || exporting}>
              <Download className="w-4 h-4" /> {exporting ? "Downloading…" : "Download all"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[200px_1fr_220px] md:grid-cols-[220px_1fr_240px] lg:grid-cols-[260px_1fr_280px] min-h-0">
        {/* Slides + layers */}
        <aside className="border-r border-border overflow-hidden p-3 bg-card flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              hidden
              // @ts-expect-error non-standard attributes
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={layerImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                addImageLayers(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="text-xs uppercase tracking-wider text-muted-foreground flex-1">Artboards</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fileInputRef.current?.click()} aria-label="Add images" title="Add images">
              <Upload className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => folderInputRef.current?.click()} aria-label="Add folder" title="Add folder">
              <FolderUp className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addBlankSlide} aria-label="New artboard" title="New artboard">
              <FilePlus className="w-4 h-4" />
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-1 border-b border-border pb-2">
            <button
              onClick={() => layerImageInputRef.current?.click()}
              disabled={!selected}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              title="Add image layer"
              aria-label="Add image layer"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!selected}
                  className={`p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none ${tool === "rect" || tool === "ellipse" || tool === "line" ? "bg-accent text-accent-foreground" : ""}`}
                  title="Shape tool (R)"
                  aria-label="Shape tool"
                >
                  <Square className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[9rem]">
                <DropdownMenuItem onClick={() => setTool((t) => (t === "rect" ? null : "rect"))}>
                  <Square className="w-3.5 h-3.5 mr-2" /> Rectangle
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTool((t) => (t === "ellipse" ? null : "ellipse"))}>
                  <Circle className="w-3.5 h-3.5 mr-2" /> Round
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTool((t) => (t === "line" ? null : "line"))}>
                  <Minus className="w-3.5 h-3.5 mr-2" /> Line
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setTool((t) => (t === "text" ? null : "text"))}
              disabled={!selected}
              className={`p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none ${tool === "text" ? "bg-accent text-accent-foreground" : ""}`}
              title="Text tool (T)"
              aria-label="Text tool"
            >
              <Type className="w-4 h-4" />
            </button>
          </div>



          <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 mt-2 -mr-1 pr-1">
            {projectLoading && (
              <div className="space-y-1.5 py-2" aria-label="Loading artboards">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 rounded bg-muted animate-pulse" />
                ))}
              </div>
            )}
            {!projectLoading && images.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">
                No artboards yet. Add an artboard or upload images.
              </div>
            )}
            {images.map((img, index) => {
              const isActive = img.id === selectedId;
              const expanded = expandedSlides[img.id] ?? isActive;
              return (
                <div key={img.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(index);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverIndex !== index) setDragOverIndex(index);
                    }}
                    onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null) reorderImages(dragIndex, index);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onClick={() => {
                      setSelectedId(img.id);
                      setSelectedLayerId(null);
                    }}
                    className={`group flex items-center gap-1 rounded px-1 py-1.5 cursor-pointer border transition ${
                      isActive && !selectedLayerId
                        ? "border-accent bg-accent/10"
                        : "border-transparent hover:bg-muted"
                    } ${dragIndex === index ? "opacity-40" : ""} ${
                      dragOverIndex === index && dragIndex !== null && dragIndex !== index ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSlides((prev) => ({ ...prev, [img.id]: !expanded }));
                      }}
                      className="p-0.5 rounded hover:bg-muted-foreground/10 shrink-0"
                      aria-label={expanded ? "Collapse layers" : "Expand layers"}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                    </button>
                    {renamingId === img.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(img.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitRename(img.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 min-w-0 text-sm bg-background border border-accent rounded px-1 py-0.5 outline-none"
                      />
                    ) : (
                      <span
                        className="text-sm truncate flex-1"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(img.id);
                          setRenameDraft(img.name);
                        }}
                      >
                        {img.name}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadImage(img);
                        }}
                        className="p-1 rounded hover:bg-muted-foreground/10"
                        title="Download"
                        aria-label="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteImage(img.id);
                        }}
                        className="p-1 rounded hover:bg-muted-foreground/10"
                        title="Remove artboard"
                        aria-label="Remove artboard"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>

                  {expanded && (
                    <div className="ml-5 border-l border-border pl-1 space-y-0.5">
                      {img.layers.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-muted-foreground">No layers</div>
                      )}
                      {img.layers.map((l, layerIndex) => (
                        <div
                          key={l.id}
                          draggable={renamingLayerId !== l.id}
                          onDragStart={(e) => {
                            setDragLayer({ imgId: img.id, index: layerIndex });
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (!dragLayer || dragLayer.imgId !== img.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverLayer?.index !== layerIndex || dragOverLayer?.imgId !== img.id)
                              setDragOverLayer({ imgId: img.id, index: layerIndex });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragLayer && dragLayer.imgId === img.id)
                              reorderLayers(img.id, dragLayer.index, layerIndex);
                            setDragLayer(null);
                            setDragOverLayer(null);
                          }}
                          onDragEnd={() => {
                            setDragLayer(null);
                            setDragOverLayer(null);
                          }}
                          className={`group flex items-center rounded border transition ${
                            selectedLayerIds.includes(l.id) && isActive
                              ? "border-accent bg-accent/10"
                              : "border-transparent hover:bg-muted"
                          } ${dragLayer?.imgId === img.id && dragLayer.index === layerIndex ? "opacity-40" : ""} ${
                            dragOverLayer?.imgId === img.id &&
                            dragOverLayer.index === layerIndex &&
                            dragLayer?.index !== layerIndex
                              ? "ring-2 ring-accent"
                              : ""
                          }`}

                        >
                          <button
                            onClick={(e) => {
                              setSelectedId(img.id);
                              if ((e.shiftKey || e.metaKey) && img.id === selectedId) toggleLayerSelection(l.id);
                              else setSelectedLayerId(l.id);
                            }}
                            className="flex-1 min-w-0 text-left px-2 py-1 text-xs truncate"
                          >
                            {renamingLayerId === l.id ? (
                              <span className="flex items-center gap-1.5">
                                {l.kind === "image" ? (
                                  <ImageIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
                                ) : l.kind === "shape" ? (
                                  <Square className="w-3 h-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <Type className="w-3 h-3 shrink-0 text-muted-foreground" />
                                )}
                                <input
                                  autoFocus
                                  value={renameLayerDraft}
                                  onChange={(e) => setRenameLayerDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={(e) => e.stopPropagation()}
                                  onBlur={() => commitLayerRename(img.id, l.id)}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") commitLayerRename(img.id, l.id);
                                    if (e.key === "Escape") setRenamingLayerId(null);
                                  }}
                                  className="min-w-0 bg-background border border-accent rounded px-1 py-0.5 outline-none text-xs w-full"
                                />
                              </span>
                            ) : (
                              <>
                                {l.kind === "image" || l.kind === "shape" ? (
                                  <span
                                    className="flex items-center gap-1.5"
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingLayerId(l.id);
                                      setRenameLayerDraft(
                                        l.name || (l.kind === "shape" ? SHAPE_LABEL[l.shape ?? "rect"] : "Image")
                                      );
                                    }}
                                  >
                                    {l.kind === "shape" ? (
                                      <Square className="w-3 h-3 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ImageIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="truncate">
                                      {l.name || (l.kind === "shape" ? SHAPE_LABEL[l.shape ?? "rect"] : "Image")}
                                    </span>
                                  </span>
                                ) : (
                                  <span
                                    className="flex items-center gap-1.5"
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingLayerId(l.id);
                                      setRenameLayerDraft(l.name || l.text);
                                    }}
                                  >
                                    <Type className="w-3 h-3 shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                      {l.name || l.text || <span className="text-muted-foreground italic">empty</span>}
                                    </span>
                                  </span>
                                )}

                              </>
                            )}
                          </button>
                          {isActive && (
                            <div className="flex items-center gap-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateLayer(l.id);
                                }}
                                className="p-1 rounded hover:bg-muted-foreground/10"
                                title="Duplicate"
                                aria-label="Duplicate"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteLayer(l.id);
                                }}
                                className="p-1 rounded hover:bg-muted-foreground/10"
                                title="Delete"
                                aria-label="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>



        {/* Canvas */}
        <main className="relative bg-muted/30 min-h-0 flex flex-col">
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-background/30 backdrop-blur border border-border rounded-md px-2 py-1 shadow-card">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <button
              className="p-1 rounded hover:bg-muted-foreground/10"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <Select value={zoom} onValueChange={(v) => setZoom(v as ZoomMode)}>
              <SelectTrigger className="h-7 w-32 text-xs border-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!ZOOM_OPTIONS.some((o) => o.value === zoom) && (
                  <SelectItem value={zoom} className="text-xs">
                    {zoom}%
                  </SelectItem>
                )}
                {ZOOM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className="p-1 rounded hover:bg-muted-foreground/10"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-3 md:p-6">
            {selected ? (
              <CanvasStage
                key={selected.id}
                image={selected}
                wrapRef={canvasWrapRef}
                zoom={zoom}
                onZoomWheel={zoomBy}
                selectedLayerId={selectedLayerId}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={setSelectedLayerId}
                onToggleSelectLayer={toggleLayerSelection}
                onSetSelection={setSelectedLayerIds}
                onMoveLayer={(id, xPct, yPct) => updateLayer(id, { xPct, yPct })}
                onMoveLayers={moveLayers}
                onDuplicateLayer={(id) => duplicateLayer(id, { offset: false, select: true })}
                onTransformLayer={(id, patch) => updateLayer(id, patch)}
                onEditLayerText={(id, text) => updateLayer(id, { text })}
                onCropLayer={cropImageLayer}
                onMoveImage={(xPct, yPct) => {
                  if (!selected) return;
                  setImages((prev) =>
                    prev.map((im) =>
                      im.id === selected.id
                        ? { ...im, imageOffsetXPct: xPct, imageOffsetYPct: yPct }
                        : im
                    )
                  );
                }}
                watermarkTop={selected.watermarkTop}
                watermarkBottom={selected.watermarkBottom}
                onBeginInteraction={commit}
                tool={tool}
                onPlaceTool={(xPct, yPct, wPct, hPct) => {
                  if (!tool) return;
                  const dragged = wPct != null && hPct != null;
                  if (tool === "text") {
                    addLayer({
                      xPct,
                      yPct,
                      widthPct: dragged ? Math.max(wPct!, 2) : undefined,
                      heightPct: dragged ? Math.max(hPct!, 2) : undefined,
                      center: !dragged,
                    });
                  } else {
                    const w = dragged ? Math.max(wPct!, 1) : 40;
                    const h = dragged ? Math.max(hPct!, tool === "line" ? 0.5 : 1) : tool === "line" ? 2 : 30;
                    addShapeLayer(tool, {
                      xPct: dragged ? xPct : xPct - w / 2,
                      yPct: dragged ? yPct : yPct - h / 2,
                      widthPct: w,
                      heightPct: h,
                    });
                  }
                  setTool(null);
                }}


              />
            ) : projectLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading project…</div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Select or add an image to start editing.</div>
            )}
          </div>
        </main>


        {/* Properties panel */}
        <aside className="border-l border-border overflow-y-auto p-3 lg:p-4 space-y-4 bg-card">
          {!selected && (
            <p className="text-xs text-muted-foreground">Select an artboard or layer to edit its properties.</p>
          )}
          {selected && selectedLayerIds.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {selectedLayerIds.length} layers
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground w-10">Align</span>
                <div className="flex gap-1">
                  {([
                    ["left", AlignStartVertical, "Align left"],
                    ["hcenter", AlignCenterVertical, "Align horizontal centers"],
                    ["right", AlignEndVertical, "Align right"],
                    ["top", AlignStartHorizontal, "Align top"],
                    ["vcenter", AlignCenterHorizontal, "Align vertical centers"],
                    ["bottom", AlignEndHorizontal, "Align bottom"],
                  ] as const).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      title={label}
                      onClick={() => alignSelection(mode)}
                      className="p-1.5 rounded border border-border text-muted-foreground transition hover:text-foreground hover:border-foreground/40"
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground w-10">Dist</span>
                <div className="flex gap-1">
                  {([
                    ["hdist", AlignHorizontalDistributeCenter, "Distribute horizontally"],
                    ["vdist", AlignVerticalDistributeCenter, "Distribute vertically"],
                  ] as const).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      title={label}
                      disabled={selectedLayerIds.length < 3}
                      onClick={() => alignSelection(mode)}
                      className="p-1.5 rounded border border-border text-muted-foreground transition hover:text-foreground hover:border-foreground/40 disabled:opacity-40"
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {selected && !selectedLayer && (
          <Collapsible defaultOpen>
            <CollapsibleContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2" onPointerDownCapture={() => selected && commit()}>
                  <span className="text-[10px] font-semibold text-muted-foreground w-10">Size</span>
                  <Slider
                    value={[selected?.imageScalePct ?? 100]}
                    min={10}
                    max={100}
                    step={1}
                    disabled={!selected}
                    onValueChange={([v]) => {
                      if (!selected) return;
                      setImages((prev) =>
                        prev.map((im) => (im.id === selected.id ? { ...im, imageScalePct: Math.min(v, 100) } : im))
                      );
                    }}
                    className="flex-1"
                  />
                  <span className="text-[10px] tabular-nums text-muted-foreground w-9 text-right">
                    {Math.round(selected?.imageScalePct ?? 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground w-10">BG</span>
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => {
                      const active = selected?.bgColor === c.value;
                      return (
                        <button
                          key={c.value}
                          disabled={!selected}
                          onClick={() => {
                            if (!selected) return;
                            commit();
                            setImages((prev) =>
                              prev.map((im) => (im.id === selected.id ? { ...im, bgColor: c.value } : im))
                            );
                          }}

                          className={`w-5 h-5 rounded-full border-2 transition disabled:opacity-40 ${
                            active ? "border-foreground scale-110" : "border-border"
                          }`}
                          style={{ background: c.value }}
                          aria-label={c.name}
                          title={c.name}
                        />
                      );
                    })}
                  </div>
                </div>
                {(() => {
                  const scale = selected ? selected.imageScalePct / 100 : 1;
                  const dw = selected ? selected.width * scale : 0;
                  const dh = selected ? selected.height * scale : 0;
                  const baseX = selected ? (selected.width - dw) / 2 : 0;
                  const baseY = selected ? (selected.height - dh) / 2 : 0;
                  const posX = selected ? Math.round(baseX + (selected.imageOffsetXPct / 100) * selected.width) : 0;
                  const posY = selected ? Math.round(baseY + (selected.imageOffsetYPct / 100) * selected.height) : 0;
                  const setOffsets = (xPct: number, yPct: number) => {
                    if (!selected) return;
                    setImages((prev) =>
                      prev.map((im) =>
                        im.id === selected.id
                          ? { ...im, imageOffsetXPct: xPct, imageOffsetYPct: yPct }
                          : im
                      )
                    );
                  };


                  const setPos = (x: number, y: number) => {
                    if (!selected) return;
                    const xPct = ((x - baseX) / selected.width) * 100;
                    const yPct = ((y - baseY) / selected.height) * 100;
                    setOffsets(xPct, yPct);
                  };
                  const alignH = (a: "left" | "center" | "right") => {
                    if (!selected) return;
                    commit();
                    const xPct = a === "center" ? 0 : a === "left" ? ((scale - 1) / 2) * 100 : ((1 - scale) / 2) * 100;
                    setOffsets(xPct, selected.imageOffsetYPct);
                  };
                  const alignV = (a: "top" | "middle" | "bottom") => {
                    if (!selected) return;
                    commit();
                    const yPct = a === "middle" ? 0 : a === "top" ? ((scale - 1) / 2) * 100 : ((1 - scale) / 2) * 100;
                    setOffsets(selected.imageOffsetXPct, yPct);
                  };

                  const btn = "px-1.5 py-1 hover:bg-secondary disabled:opacity-40";
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-muted-foreground w-10">Align</span>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <div className="flex border border-border rounded overflow-hidden">
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignH("left")} aria-label="Align left" title="Align left"><AlignHorizontalDistributeStart className="w-3.5 h-3.5" /></button>
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignH("center")} aria-label="Align center" title="Align center"><AlignHorizontalDistributeCenter className="w-3.5 h-3.5" /></button>
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignH("right")} aria-label="Align right" title="Align right"><AlignHorizontalDistributeEnd className="w-3.5 h-3.5" /></button>
                          </div>
                          <div className="flex border border-border rounded overflow-hidden">
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignV("top")} aria-label="Align top" title="Align top"><AlignVerticalDistributeStart className="w-3.5 h-3.5" /></button>
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignV("middle")} aria-label="Align middle" title="Align middle"><AlignVerticalDistributeCenter className="w-3.5 h-3.5" /></button>
                            <button disabled={!selected || !!selected?.positionLocked} className={btn} onClick={() => alignV("bottom")} aria-label="Align bottom" title="Align bottom"><AlignVerticalDistributeEnd className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-muted-foreground w-10">Pos</span>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-muted-foreground">X</span>
                          <Input
                            type="number"
                            value={posX}
                            disabled={!selected || !!selected?.positionLocked}
                            onFocus={commit}
                            onChange={(e) => setPos(Number(e.target.value), posY)}
                            className="h-7 text-xs px-2"
                          />
                          <span className="text-[10px] text-muted-foreground ml-1">Y</span>
                          <Input
                            type="number"
                            value={posY}
                            disabled={!selected || !!selected?.positionLocked}
                            onFocus={commit}
                            onChange={(e) => setPos(posX, Number(e.target.value))}
                            className="h-7 text-xs px-2"
                          />
                          <button
                            type="button"
                            disabled={!selected}
                            onClick={() => {
                              if (!selected) return;
                              commit();
                              setImages((prev) =>
                                prev.map((im) =>
                                  im.id === selected.id ? { ...im, positionLocked: !im.positionLocked } : im
                                )
                              );
                            }}
                            className="ml-1 p-1 rounded hover:bg-secondary disabled:opacity-40"
                            aria-label={selected?.positionLocked ? "Unlock position" : "Lock position"}
                            title={selected?.positionLocked ? "Unlock position" : "Lock position"}
                          >
                            {selected?.positionLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                    </>
                  );
                })()}
              </div>

              <div>
                <Tabs defaultValue="watermarkTop">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Watermark</span>
                    <TabsList className="h-7 p-0.5 bg-muted rounded w-auto inline-flex">
                      <TabsTrigger value="watermarkTop" className="text-[10px] px-2 py-0.5 h-full">Top</TabsTrigger>
                      <TabsTrigger value="watermarkBottom" className="text-[10px] px-2 py-0.5 h-full">Bottom</TabsTrigger>
                    </TabsList>
                  </div>
                  {(["watermarkTop", "watermarkBottom"] as const).map((key) => {
                    const wm = selected?.[key];
                    return (
                      <TabsContent key={key} value={key} className="mt-0">
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex border border-border rounded overflow-hidden">
                            {[
                              { value: "left" as const, icon: AlignLeft },
                              { value: "center" as const, icon: AlignCenter },
                              { value: "right" as const, icon: AlignRight },
                            ].map(({ value, icon: Icon }) => (
                              <button
                                key={value}
                                disabled={!selected}
                                onClick={() => {
                                  if (!selected) return;
                                  commit();
                                  setImages((prev) =>
                                    prev.map((im) =>
                                      im.id === selected.id ? { ...im, [key]: { ...im[key], align: value } } : im
                                    )
                                  );
                                }}

                                className={`px-1.5 py-1 flex items-center justify-center transition disabled:opacity-40 ${
                                  wm?.align === value ? "bg-foreground text-background" : "hover:bg-muted"
                                }`}
                                aria-label={value}
                              >
                                <Icon className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            {WATERMARK_COLORS.map((c) => {
                              const active = wm?.color === c.value;
                              return (
                                <button
                                  key={c.value}
                                  disabled={!selected}
                                  onClick={() => {
                                    if (!selected) return;
                                    commit();
                                    setImages((prev) =>
                                      prev.map((im) =>
                                        im.id === selected.id ? { ...im, [key]: { ...im[key], color: c.value } } : im
                                      )
                                    );
                                  }}

                                  className={`w-4 h-4 rounded-full border transition disabled:opacity-40 ${
                                    active ? "border-foreground scale-110" : "border-border"
                                  }`}
                                  style={{ background: c.value }}
                                  aria-label={c.name}
                                  title={c.name}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>
            </CollapsibleContent>
          </Collapsible>
          )}





          {selected && selectedLayer && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground w-10">Pos</span>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-[10px] text-muted-foreground">X</span>
                  <Input
                    type="number"
                    className="h-7 text-xs px-2"
                    value={Math.round((selectedLayer.xPct / 100) * selected.width)}
                    onFocus={commit}
                    onChange={(e) => {
                      const px = Number(e.target.value);
                      if (!Number.isFinite(px)) return;
                      updateLayer(selectedLayer.id, { xPct: (px / selected.width) * 100 });
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground ml-1">Y</span>
                  <Input
                    type="number"
                    className="h-7 text-xs px-2"
                    value={Math.round((selectedLayer.yPct / 100) * selected.height)}
                    onFocus={commit}
                    onChange={(e) => {
                      const px = Number(e.target.value);
                      if (!Number.isFinite(px)) return;
                      updateLayer(selectedLayer.id, { yPct: (px / selected.height) * 100 });
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground w-10">Rotate</span>
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    type="number"
                    className="h-7 text-xs px-2"
                    value={Math.round(selectedLayer.rotation ?? 0)}
                    onFocus={commit}
                    onChange={(e) => {
                      const deg = Number(e.target.value);
                      if (!Number.isFinite(deg)) return;
                      updateLayer(selectedLayer.id, { rotation: deg });
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">deg</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => {
                      commit();
                      updateLayer(selectedLayer.id, { rotation: 0 });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>



              {selectedLayer.kind === "image" ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground w-10">Size</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[10px] text-muted-foreground">W</span>
                    <Input
                      type="number"
                      className="h-7 text-xs px-2"
                      value={Math.round((selectedLayer.widthPct / 100) * selected.width)}
                      onFocus={commit}
                      onChange={(e) => {
                        const px = Number(e.target.value);
                        if (!Number.isFinite(px) || px <= 0) return;
                        const ratio = selectedLayer.widthPct / (selectedLayer.heightPct || 1);
                        const widthPct = (px / selected.width) * 100;
                        updateLayer(selectedLayer.id, { widthPct, heightPct: widthPct / ratio });
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground ml-1">H</span>
                    <Input
                      type="number"
                      className="h-7 text-xs px-2"
                      value={Math.round((selectedLayer.heightPct / 100) * selected.height)}
                      onFocus={commit}
                      onChange={(e) => {
                        const px = Number(e.target.value);
                        if (!Number.isFinite(px) || px <= 0) return;
                        const ratio = selectedLayer.widthPct / (selectedLayer.heightPct || 1);
                        const heightPct = (px / selected.height) * 100;
                        updateLayer(selectedLayer.id, { heightPct, widthPct: heightPct * ratio });
                      }}
                    />
                  </div>
                </div>
              ) : selectedLayer.kind === "shape" ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Size</span>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-[10px] text-muted-foreground">W</span>
                      <Input
                        type="number"
                        className="h-7 text-xs px-2"
                        value={Math.round((selectedLayer.widthPct / 100) * selected.width)}
                        onFocus={commit}
                        onChange={(e) => {
                          const px = Number(e.target.value);
                          if (!Number.isFinite(px) || px <= 0) return;
                          updateLayer(selectedLayer.id, { widthPct: (px / selected.width) * 100 });
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground ml-1">H</span>
                      <Input
                        type="number"
                        className="h-7 text-xs px-2"
                        value={Math.round((selectedLayer.heightPct / 100) * selected.height)}
                        onFocus={commit}
                        onChange={(e) => {
                          const px = Number(e.target.value);
                          if (!Number.isFinite(px) || px <= 0) return;
                          updateLayer(selectedLayer.id, { heightPct: (px / selected.height) * 100 });
                        }}
                      />
                    </div>
                  </div>

                  {selectedLayer.shape !== "line" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-muted-foreground w-10">Fill</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <button
                          onClick={() => { commit(); updateLayer(selectedLayer.id, { fill: null }); }}
                          className={`w-4 h-4 rounded-full border bg-background relative overflow-hidden transition ${
                            !selectedLayer.fill ? "border-foreground scale-110" : "border-border"
                          }`}
                          aria-label="No fill"
                          title="No fill"
                        >
                          <span className="absolute left-1/2 top-1/2 w-[130%] h-px bg-destructive -translate-x-1/2 -translate-y-1/2 rotate-45" />
                        </button>
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => { commit(); updateLayer(selectedLayer.id, { fill: c.value }); }}
                            className={`w-4 h-4 rounded-full border transition ${
                              selectedLayer.fill === c.value ? "border-foreground scale-110" : "border-border"
                            }`}
                            style={{ background: c.value }}
                            aria-label={c.name}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Stroke</span>
                    <div className="flex items-center gap-1.5 flex-1">
                      {selectedLayer.shape !== "line" && (
                        <button
                          onClick={() => { commit(); updateLayer(selectedLayer.id, { stroke: null }); }}
                          className={`w-4 h-4 rounded-full border bg-background relative overflow-hidden transition ${
                            !selectedLayer.stroke ? "border-foreground scale-110" : "border-border"
                          }`}
                          aria-label="No stroke"
                          title="No stroke"
                        >
                          <span className="absolute left-1/2 top-1/2 w-[130%] h-px bg-destructive -translate-x-1/2 -translate-y-1/2 rotate-45" />
                        </button>
                      )}
                      {COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => { commit(); updateLayer(selectedLayer.id, { stroke: c.value }); }}
                          className={`w-4 h-4 rounded-full border transition ${
                            selectedLayer.stroke === c.value ? "border-foreground scale-110" : "border-border"
                          }`}
                          style={{ background: c.value }}
                          aria-label={c.name}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Width</span>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs px-2 flex-1"
                      value={selectedLayer.strokeWidth ?? 0}
                      onFocus={commit}
                      onChange={(e) => {
                        const px = Number(e.target.value);
                        if (!Number.isFinite(px) || px < 0) return;
                        updateLayer(selectedLayer.id, { strokeWidth: px });
                      }}
                    />
                  </div>

                  {selectedLayer.shape === "rect" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-muted-foreground w-10">Radius</span>
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs px-2 flex-1"
                        value={selectedLayer.radiusPx ?? 0}
                        onFocus={commit}
                        onChange={(e) => {
                          const px = Number(e.target.value);
                          if (!Number.isFinite(px) || px < 0) return;
                          updateLayer(selectedLayer.id, { radiusPx: px });
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (

                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Align</span>
                    <div className="flex border border-border rounded overflow-hidden">
                      {[
                        { value: "left" as const, icon: AlignLeft },
                        { value: "center" as const, icon: AlignCenter },
                        { value: "right" as const, icon: AlignRight },
                      ].map(({ value, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => { commit(); updateLayer(selectedLayer.id, { align: value }); }}
                          className={`px-1.5 py-1 transition ${
                            selectedLayer.align === value
                              ? "bg-foreground text-background"
                              : "hover:bg-secondary"
                          }`}
                          aria-label={value}
                          title={value}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10 pt-2">Text</span>
                    <Textarea
                      value={selectedLayer.text}
                      onFocus={commit}
                      onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                      rows={4}
                      className="flex-1 text-xs"
                      style={{ fontFamily: "Comico, system-ui" }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Size</span>
                    <div className="flex items-stretch flex-1">
                      <button
                        type="button"
                        onClick={() => { commit(); updateLayer(selectedLayer.id, { fontSizePx: Math.max(1, selectedLayer.fontSizePx - 1) }); }}
                        className="h-7 w-7 inline-flex items-center justify-center border border-input bg-background text-muted-foreground hover:bg-secondary rounded-l rounded-r-none border-r-0 transition"
                        aria-label="Decrease font size"
                        title="Decrease font size"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { commit(); updateLayer(selectedLayer.id, { fontSizePx: selectedLayer.fontSizePx + 1 }); }}
                        className="h-7 w-7 inline-flex items-center justify-center border border-input bg-background text-muted-foreground hover:bg-secondary rounded-none transition"
                        aria-label="Increase font size"
                        title="Increase font size"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-7 text-xs px-2 tabular-nums rounded-none border-l-0 border-r-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={Math.round(selectedLayer.fontSizePx)}
                        onFocus={commit}
                        onChange={(e) => {
                          const px = Number(e.target.value);
                          if (!Number.isFinite(px) || px <= 0) return;
                          updateLayer(selectedLayer.id, { fontSizePx: px });
                        }}
                      />
                      <Select
                        value={String(Math.round(selectedLayer.fontSizePx))}
                        onValueChange={(v) => { commit(); updateLayer(selectedLayer.id, { fontSizePx: Number(v) }); }}
                      >
                        <SelectTrigger className="h-7 w-7 px-0 justify-center rounded-l-none border-input [&>span]:hidden [&>svg]:opacity-100 [&>svg]:ml-0" aria-label="Font size presets" />
                        <SelectContent>
                          {Array.from({ length: 49 }, (_, i) => (i + 2) * 4).map((s) => (
                            <SelectItem key={s} value={String(s)} className="text-sm">{s}px</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground w-10">Color</span>
                    <div className="flex gap-1.5">
                      {COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => { commit(); updateLayer(selectedLayer.id, { color: c.value }); }}
                          className={`w-5 h-5 rounded-full border-2 transition ${
                            selectedLayer.color === c.value
                              ? "border-foreground scale-110"
                              : "border-border"
                          }`}
                          style={{ background: c.value }}
                          aria-label={c.name}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </aside>
      </div>
    </div>
  );
};

const CanvasStage = ({
  image,
  wrapRef,
  zoom,
  onZoomWheel,
  selectedLayerId,
  selectedLayerIds,
  onSelectLayer,
  onToggleSelectLayer,
  onSetSelection,
  onMoveLayer,
  onMoveLayers,
  onDuplicateLayer,
  onTransformLayer,
  onEditLayerText,
  onCropLayer,
  onMoveImage,
  watermarkTop,
  watermarkBottom,
  onBeginInteraction,
  tool,
  onPlaceTool,
}: {
  image: EditorImage;
  wrapRef: React.RefObject<HTMLDivElement>;
  zoom: ZoomMode;
  onZoomWheel: (factor: number) => void;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  onSelectLayer: (id: string) => void;
  onToggleSelectLayer: (id: string) => void;
  onSetSelection: (ids: string[]) => void;
  onMoveLayer: (id: string, xPct: number, yPct: number) => void;
  onMoveLayers: (moves: { id: string; xPct: number; yPct: number }[]) => void;
  onDuplicateLayer: (id: string) => string | null;
  onTransformLayer: (id: string, patch: LayerTransform) => void;
  onEditLayerText: (id: string, text: string) => void;
  onCropLayer: (id: string, rect: { x: number; y: number; w: number; h: number }) => void;
  onMoveImage: (xPct: number, yPct: number) => void;
  watermarkTop: WatermarkSettings;
  watermarkBottom: WatermarkSettings;
  onBeginInteraction: () => void;
  tool: null | "rect" | "ellipse" | "line" | "text";
  onPlaceTool: (xPct: number, yPct: number, wPct?: number, hPct?: number) => void;

}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceDownRef = useRef(false);
  const [panning, setPanning] = useState(false);
  // Crop mode for image layers: rect is expressed in fractions of the layer box.
  const [crop, setCrop] = useState<
    { id: string; x: number; y: number; w: number; h: number } | null
  >(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [guides, setGuides] = useState({
    top: false,
    right: false,
    bottom: false,
    left: false,
    hCenter: false,
    vCenter: false,
  });
  const [measure, setMeasure] = useState<
    { left: number; right: number; top: number; bottom: number; x: number; y: number; w: number; h: number } | null
  >(null);
  // Alt + hover another layer while one is selected => show distance between them.
  const [altDown, setAltDown] = useState(false);
  const [hoverLayerId, setHoverLayerId] = useState<string | null>(null);
  // Marquee (drag-to-select) rectangle in stage % coordinates.
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [objGuides, setObjGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [toolBox, setToolBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const sync = (e: KeyboardEvent | MouseEvent) => setAltDown((e as KeyboardEvent).altKey === true);
    const clear = () => setAltDown(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("mousemove", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("mousemove", sync);
      window.removeEventListener("blur", clear);
    };
  }, []);


  // Reset pan when switching slides (but not on zoom, so wheel-zoom keeps position)
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [image.id]);

  // Center the canvas when using fit-to-height or fit-to-width zoom.
  useEffect(() => {
    if (zoom === "fit-height" || zoom === "fit-width") {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Track Space key for pan mode
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isEditable(e.target)) {
        e.preventDefault();
        spaceDownRef.current = true;
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };
    const blur = () => {
      spaceDownRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Cmd/Ctrl + scroll (or trackpad pinch) zooms the canvas
  const onZoomWheelRef = useRef(onZoomWheel);
  onZoomWheelRef.current = onZoomWheel;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const norm = (d: number, mode: number) => d * (mode === 1 ? 16 : mode === 2 ? 100 : 1);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dx = norm(e.deltaX, e.deltaMode);
      const dy = norm(e.deltaY, e.deltaMode);
      if (e.metaKey || e.ctrlKey) {
        onZoomWheelRef.current(Math.exp(-dy * 0.002));
      } else {
        setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wrapRef]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const compute = () => {
      const wrap = wrapRef.current!;
      const ratio = image.width / image.height;
      let w = 0;
      let h = 0;
      if (zoom === "fit-height") {
        h = Math.max(0, wrap.clientHeight);
        w = h * ratio;
      } else if (zoom === "fit-width") {
        w = Math.max(0, wrap.clientWidth);
        h = w / ratio;
      } else {
        const pct = Number(zoom) / 100;
        w = image.width * pct;
        h = image.height * pct;
      }
      setDisplaySize({ w, h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [image, wrapRef, zoom]);

  const onWrapPointerDown = (e: React.PointerEvent) => {
    if (!spaceDownRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setPanning(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = pan;
    const move = (ev: PointerEvent) => {
      setPan({ x: startPan.x + (ev.clientX - startX), y: startPan.y + (ev.clientY - startY) });
    };
    const up = (ev: PointerEvent) => {
      try { target.releasePointerCapture(ev.pointerId); } catch {}
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };



  const onPointerDown = (e: React.PointerEvent, layerId: string) => {
    if (spaceDownRef.current) return; // let it bubble to the wrapper for panning
    e.stopPropagation();

    // Shift/Cmd click toggles the layer in the current selection instead of dragging.
    if (e.shiftKey || e.metaKey) {
      onToggleSelectLayer(layerId);
      return;
    }

    onBeginInteraction();

    // Multi-selection: dragging any selected layer moves the whole group.
    if (selectedLayerIds.length > 1 && selectedLayerIds.includes(layerId)) {
      const target0 = e.currentTarget as HTMLElement;
      target0.setPointerCapture(e.pointerId);
      const rect0 = stageRef.current!.getBoundingClientRect();
      const startX0 = e.clientX;
      const startY0 = e.clientY;
      const starts = image.layers
        .filter((l) => selectedLayerIds.includes(l.id))
        .map((l) => ({ id: l.id, xPct: l.xPct, yPct: l.yPct }));
      const selLayers = image.layers.filter((l) => selectedLayerIds.includes(l.id));
      const bx = Math.min(...selLayers.map((l) => l.xPct));
      const by = Math.min(...selLayers.map((l) => l.yPct));
      const bw = Math.max(...selLayers.map((l) => l.xPct + l.widthPct)) - bx;
      const bh = Math.max(...selLayers.map((l) => l.yPct + l.heightPct)) - by;
      const move0 = (ev: PointerEvent) => {
        const dx = ((ev.clientX - startX0) / rect0.width) * 100;
        const dy = ((ev.clientY - startY0) / rect0.height) * 100;
        let ax = dx;
        let ay = dy;
        if (!ev.altKey) {
          const sn = snapToLayers(bx + dx, by + dy, bw, bh, selectedLayerIds, 1.5);
          ax = sn.x - bx;
          ay = sn.y - by;
          setObjGuides({ v: sn.v, h: sn.h });
        } else setObjGuides({ v: [], h: [] });
        onMoveLayers(starts.map((s) => ({ id: s.id, xPct: s.xPct + ax, yPct: s.yPct + ay })));
      };
      const up0 = (ev: PointerEvent) => {
        setObjGuides({ v: [], h: [] });
        try { target0.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
        window.removeEventListener("pointermove", move0);
        window.removeEventListener("pointerup", up0);
      };
      window.addEventListener("pointermove", move0);
      window.addEventListener("pointerup", up0);
      return;
    }

    // Alt/Option + drag duplicates the layer and drags the copy (Figma-style).
    let activeId = layerId;
    if (e.altKey) {
      const dupId = onDuplicateLayer(layerId);
      if (dupId) activeId = dupId;
    }
    onSelectLayer(activeId);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const sourceLayer = image.layers.find((l) => l.id === layerId)!;
    const startX = e.clientX;
    const startY = e.clientY;
    const startXPct = sourceLayer.xPct;
    const startYPct = sourceLayer.yPct;


    const w = sourceLayer.widthPct;
    const h = sourceLayer.heightPct;
    const SNAP = 1.5;

    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      // Layers may be moved beyond the artboard; export clips to the artboard.
      let nx = startXPct + dx;
      let ny = startYPct + dy;

      if (ev.altKey) {
        setGuides({ top: false, right: false, bottom: false, left: false, hCenter: false, vCenter: false });
        setObjGuides({ v: [], h: [] });
        setMeasure({ left: nx, right: 100 - (nx + w), top: ny, bottom: 100 - (ny + h), x: nx, y: ny, w, h });
      } else {
        setMeasure(null);
        const nearLeft = Math.abs(nx) < SNAP;
        const nearRight = Math.abs(nx + w - 100) < SNAP;
        const nearTop = Math.abs(ny) < SNAP;
        const nearBottom = Math.abs(ny + h - 100) < SNAP;
        const nearVCenter = Math.abs(nx + w / 2 - 50) < SNAP;
        const nearHCenter = Math.abs(ny + h / 2 - 50) < SNAP;

        setGuides({
          top: nearTop,
          right: nearRight,
          bottom: nearBottom,
          left: nearLeft,
          hCenter: nearHCenter,
          vCenter: nearVCenter,
        });

        if (nearLeft) nx = 0;
        else if (nearRight) nx = 100 - w;
        else if (nearVCenter) nx = (100 - w) / 2;

        if (nearTop) ny = 0;
        else if (nearBottom) ny = 100 - h;
        else if (nearHCenter) ny = (100 - h) / 2;

        // Magnet to nearby layers when not already snapped to the artboard.
        const sn = snapToLayers(nx, ny, w, h, [activeId], SNAP);
        const lockedX = nearLeft || nearRight || nearVCenter;
        const lockedY = nearTop || nearBottom || nearHCenter;
        if (!lockedX) nx = sn.x;
        if (!lockedY) ny = sn.y;
        setObjGuides({ v: lockedX ? [] : sn.v, h: lockedY ? [] : sn.h });
      }

      onMoveLayer(activeId, nx, ny);
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      setGuides({ top: false, right: false, bottom: false, left: false, hCenter: false, vCenter: false });
      setObjGuides({ v: [], h: [] });
      setMeasure(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Magnet snapping to other layers' edges/centers (Figma-style smart guides).
  const snapToLayers = (
    nx: number,
    ny: number,
    w: number,
    h: number,
    excludeIds: string[],
    threshold: number
  ) => {
    const others = image.layers.filter((l) => !excludeIds.includes(l.id));
    const v: number[] = [];
    const hs: number[] = [];
    let x = nx;
    let y = ny;
    let bestX: { d: number; x: number; line: number } | null = null;
    let bestY: { d: number; y: number; line: number } | null = null;
    for (const o of others) {
      const oEdgesX = [o.xPct, o.xPct + o.widthPct / 2, o.xPct + o.widthPct];
      const myEdgesX = [nx, nx + w / 2, nx + w];
      for (const oe of oEdgesX) {
        for (const me of myEdgesX) {
          const d = Math.abs(oe - me);
          if (d < threshold && (!bestX || d < bestX.d)) bestX = { d, x: nx + (oe - me), line: oe };
        }
      }
      const oEdgesY = [o.yPct, o.yPct + o.heightPct / 2, o.yPct + o.heightPct];
      const myEdgesY = [ny, ny + h / 2, ny + h];
      for (const oe of oEdgesY) {
        for (const me of myEdgesY) {
          const d = Math.abs(oe - me);
          if (d < threshold && (!bestY || d < bestY.d)) bestY = { d, y: ny + (oe - me), line: oe };
        }
      }
    }
    if (bestX) {
      x = bestX.x;
      v.push(bestX.line);
    }
    if (bestY) {
      y = bestY.y;
      hs.push(bestY.line);
    }
    return { x, y, v, h: hs };
  };

  // Drag the round handle above a layer to spin it around its center.
  const onRotatePointerDown = (e: React.PointerEvent, layerId: string) => {
    if (spaceDownRef.current) return;
    e.stopPropagation();
    onBeginInteraction();
    onSelectLayer(layerId);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const layer = image.layers.find((l) => l.id === layerId)!;
    const cx = rect.left + ((layer.xPct + layer.widthPct / 2) / 100) * rect.width;
    const cy = rect.top + ((layer.yPct + layer.heightPct / 2) / 100) * rect.height;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    const startRotation = layer.rotation ?? 0;

    const move = (ev: PointerEvent) => {
      const angle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      let next = startRotation + (angle - startAngle);
      if (ev.shiftKey) next = Math.round(next / 15) * 15;
      next = Math.round(next);
      // Keep the value readable: -180..180
      next = ((next % 360) + 540) % 360 - 180;
      onTransformLayer(layerId, { rotation: next });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };



  const onResizePointerDown = (
    e: React.PointerEvent,
    layerId: string,
    dir: ResizeDir,
  ) => {
    if (spaceDownRef.current) return;
    e.stopPropagation();
    onBeginInteraction();
    onSelectLayer(layerId);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const layer = image.layers.find((l) => l.id === layerId)!;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = {
      xPct: layer.xPct,
      yPct: layer.yPct,
      widthPct: layer.widthPct,
      heightPct: layer.heightPct,
    };
    const MIN = 5;
    // Image layers keep their aspect ratio while resizing.
    const lockRatio = layer.kind === "image" && start.heightPct > 0;
    const ratio = start.widthPct / (start.heightPct || 1);

    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;

      if (lockRatio) {
        // Decide the driving axis, then derive the other from the ratio.
        const horizontal = dir.includes("e") || dir.includes("w");
        const vertical = dir.includes("n") || dir.includes("s");
        let w = start.widthPct;
        if (horizontal) w = start.widthPct + (dir.includes("e") ? dx : -dx);
        if (vertical && !horizontal) {
          const h = start.heightPct + (dir.includes("s") ? dy : -dy);
          w = h * ratio;
        } else if (horizontal && vertical) {
          const h = start.heightPct + (dir.includes("s") ? dy : -dy);
          // Corners: follow whichever axis moved more.
          if (Math.abs(h * ratio - start.widthPct) > Math.abs(w - start.widthPct)) w = h * ratio;
        }
        w = Math.max(MIN, w);
        let h = w / ratio;
        // Keep the box inside the canvas from its anchored edge.
        const maxW = dir.includes("w") ? start.xPct + start.widthPct : 100 - start.xPct;
        const maxH = dir.includes("n") ? start.yPct + start.heightPct : 100 - start.yPct;
        const capped = Math.min(w, maxW, maxH * ratio);
        w = Math.max(MIN, capped);
        h = w / ratio;
        const patch: LayerTransform = { widthPct: w, heightPct: h };
        if (dir.includes("w")) patch.xPct = start.xPct + start.widthPct - w;
        else if (!dir.includes("e")) patch.xPct = start.xPct + (start.widthPct - w) / 2;
        if (dir.includes("n")) patch.yPct = start.yPct + start.heightPct - h;
        else if (!dir.includes("s")) patch.yPct = start.yPct + (start.heightPct - h) / 2;
        onTransformLayer(layerId, patch);
        return;
      }

      const patch: LayerTransform = {};
      // Horizontal
      if (dir.includes("e")) {
        const w = Math.max(MIN, Math.min(100 - start.xPct, start.widthPct + dx));
        patch.widthPct = w;
      } else if (dir.includes("w")) {
        const maxDx = start.widthPct - MIN;
        const clampedDx = Math.max(-start.xPct, Math.min(maxDx, dx));
        patch.xPct = start.xPct + clampedDx;
        patch.widthPct = start.widthPct - clampedDx;
      }
      // Vertical
      if (dir.includes("s")) {
        const h = Math.max(MIN, Math.min(100 - start.yPct, start.heightPct + dy));
        patch.heightPct = h;
      } else if (dir.includes("n")) {
        const maxDy = start.heightPct - MIN;
        const clampedDy = Math.max(-start.yPct, Math.min(maxDy, dy));
        patch.yPct = start.yPct + clampedDy;
        patch.heightPct = start.heightPct - clampedDy;
      }
      onTransformLayer(layerId, patch);
    };

    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Double-clicking a selection handle fits the box to the text:
  // top/bottom -> height, left/right -> width, corners -> both width and height.
  const fitLayerBox = (layerId: string, axis: "h" | "w" | "both") => {
    const l = image.layers.find((x) => x.id === layerId);
    if (!l || l.kind === "image" || l.kind === "shape") return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = `${l.fontSizePx}px "Comico", system-ui`;

    const patch: LayerTransform = {};
    let widthPx = (l.widthPct / 100) * image.width;
    const scale = image.height > 0 ? displaySize.h / image.height : 1;
    const el = document.querySelector<HTMLElement>(`[data-layer-text="${layerId}"]`);

    // Measures the rendered node's height for the given box width (in artboard px).
    const measureHeight = (forWidthPx: number): number | null => {
      if (!el || scale <= 0) return null;
      const prevH = el.style.height;
      const prevW = el.style.width;
      el.style.width = `${forWidthPx * scale}px`;
      el.style.height = "auto";
      const h = el.getBoundingClientRect().height / scale;
      el.style.height = prevH;
      el.style.width = prevW;
      return h || null;
    };

    if (axis === "w" || axis === "both") {
      const natural = Math.max(
        1,
        ...(l.text || " ").split("\n").map((line) => ctx.measureText(line).width)
      );
      widthPx = Math.min(natural + 2, image.width);
      patch.widthPct = (widthPx / image.width) * 100;
    }

    if (axis === "h" || axis === "both") {
      // For corners, measure height after fitting the width to the longest text line.
      let heightPx = measureHeight(widthPx);
      if (!heightPx) {
        const lines = wrapLines(ctx, l.text || " ", widthPx);
        heightPx = Math.max(1, lines.length) * l.fontSizePx * LINE_HEIGHT;
      }
      patch.heightPct = (heightPx / image.height) * 100;
    }

    onTransformLayer(layerId, patch);
  };


  // While editing inline, grow the layer box so the text never scrolls.
  const growEditor = (el: HTMLTextAreaElement, layerId: string) => {
    const scale = image.height > 0 ? displaySize.h / image.height : 1;
    if (scale <= 0) return;
    el.style.height = "auto";
    const neededPx = el.scrollHeight / scale;
    el.style.height = "100%";
    const l = image.layers.find((x) => x.id === layerId);
    if (!l) return;
    const currentPx = (l.heightPct / 100) * image.height;
    if (neededPx > currentPx + 0.5) {
      onTransformLayer(layerId, { heightPct: (neededPx / image.height) * 100 });
    }
  };





  // ---- Crop mode -----------------------------------------------------------
  const cropPointerDown = (
    e: React.PointerEvent,
    mode: "move" | ResizeDir,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!crop) return;
    const box = (e.currentTarget as HTMLElement).closest("[data-crop-box]") as HTMLElement | null;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const start = { ...crop };
    const startX = e.clientX;
    const startY = e.clientY;
    const MIN = 0.05;

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      let { x, y, w, h } = start;
      if (mode === "move") {
        x = Math.max(0, Math.min(1 - w, start.x + dx));
        y = Math.max(0, Math.min(1 - h, start.y + dy));
      } else {
        if (mode.includes("e")) w = Math.max(MIN, Math.min(1 - start.x, start.w + dx));
        if (mode.includes("w")) {
          const d = Math.max(-start.x, Math.min(start.w - MIN, dx));
          x = start.x + d;
          w = start.w - d;
        }
        if (mode.includes("s")) h = Math.max(MIN, Math.min(1 - start.y, start.h + dy));
        if (mode.includes("n")) {
          const d = Math.max(-start.y, Math.min(start.h - MIN, dy));
          y = start.y + d;
          h = start.h - d;
        }
      }
      setCrop({ id: start.id, x, y, w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const applyCrop = () => {
    if (!crop) return;
    onCropLayer(crop.id, { x: crop.x, y: crop.y, w: crop.w, h: crop.h });
    setCrop(null);
  };

  useEffect(() => {
    if (!crop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCrop(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        applyCrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const CROP_HANDLES: { dir: ResizeDir; pos: string; cursor: string }[] = [
    { dir: "nw", pos: "top-0 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
    { dir: "ne", pos: "top-0 right-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "sw", pos: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "se", pos: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" },
    { dir: "n", pos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "s", pos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "w", pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
    { dir: "e", pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  ];

  const HANDLES: { dir: ResizeDir; pos: string; cursor: string }[] = [
    { dir: "n", pos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "s", pos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "w", pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
    { dir: "e", pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
    { dir: "nw", pos: "top-0 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
    { dir: "ne", pos: "top-0 right-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "sw", pos: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "se", pos: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" },
  ];

  // With a tool armed, drag on the canvas to define the new layer's box.
  const startToolDrag = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * 100;
    const sy = ((e.clientY - r.top) / r.height) * 100;
    let box = { x: sx, y: sy, w: 0, h: 0 };
    const move = (ev: PointerEvent) => {
      const cx = ((ev.clientX - r.left) / r.width) * 100;
      const cy = ((ev.clientY - r.top) / r.height) * 100;
      box = {
        x: Math.min(sx, cx),
        y: Math.min(sy, cy),
        w: Math.abs(cx - sx),
        h: Math.abs(cy - sy),
      };
      setToolBox(box);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setToolBox(null);
      const dragged = box.w > 0.5 || box.h > 0.5;
      onPlaceTool(box.x, box.y, dragged ? box.w : undefined, dragged ? box.h : undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };


  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        cursor: spaceDown ? (panning ? "grabbing" : "grab") : tool ? "crosshair" : "default",
        touchAction: "none",
      }}
      onPointerDownCapture={onWrapPointerDown}
    >
      <div
        ref={stageRef}
        className={`absolute shadow-float select-none${tool ? " cursor-crosshair [&_*]:cursor-crosshair" : ""}`}
        style={{
          width: displaySize.w,
          height: displaySize.h,
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          pointerEvents: spaceDown ? "none" : "auto",
          background: image.bgColor,
          cursor: tool ? "crosshair" : undefined,
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (tool) {
            startToolDrag(e);
            return;
          }


          const additive = e.shiftKey || e.metaKey;
          if (!additive) onSelectLayer("");
          // Drag on empty canvas => marquee selection.
          const stage = stageRef.current!;
          const rect = stage.getBoundingClientRect();
          const startX = ((e.clientX - rect.left) / rect.width) * 100;
          const startY = ((e.clientY - rect.top) / rect.height) * 100;
          const base = additive ? [...selectedLayerIds] : [];
          let box = { x: startX, y: startY, w: 0, h: 0 };
          let moved = false;
          const hitsIn = (b: typeof box) =>
            image.layers
              .filter(
                (l) =>
                  l.xPct < b.x + b.w &&
                  l.xPct + l.widthPct > b.x &&
                  l.yPct < b.y + b.h &&
                  l.yPct + l.heightPct > b.y
              )
              .map((l) => l.id);
          const move = (ev: PointerEvent) => {
            const cx = ((ev.clientX - rect.left) / rect.width) * 100;
            const cy = ((ev.clientY - rect.top) / rect.height) * 100;
            box = {
              x: Math.min(startX, cx),
              y: Math.min(startY, cy),
              w: Math.abs(cx - startX),
              h: Math.abs(cy - startY),
            };
            if (box.w > 0.3 || box.h > 0.3) moved = true;
            setMarquee(box);
            if (moved) onSetSelection(Array.from(new Set([...base, ...hitsIn(box)])));
          };

          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            setMarquee(null);
            if (!moved) return;
            onSetSelection(Array.from(new Set([...base, ...hitsIn(box)])));

          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onPointerDownCapture={(e) => {
          if (tool) {
            e.stopPropagation();
            startToolDrag(e);
            return;
          }
          if (!editingLayerId) return;
          const editingEl = stageRef.current?.querySelector('[data-editing-layer="true"]');
          if (editingEl && editingEl.contains(e.target as Node)) return;
          e.stopPropagation();
          const textarea = editingEl?.querySelector("textarea");
          if (textarea) onEditLayerText(editingLayerId, textarea.value);
          onSelectLayer("");
          setEditingLayerId(null);
        }}
      >
        {image.url && <div className="absolute inset-0 overflow-hidden pointer-events-none"><img
          src={image.url}
          alt={image.name}
          className={`absolute ${spaceDown ? "pointer-events-none" : "pointer-events-auto"} ${image.positionLocked ? "cursor-default" : "cursor-move"}`}
          draggable={false}
          onPointerDown={(e) => {
            if (image.positionLocked) return;
            e.stopPropagation();
            onBeginInteraction();
            const target = e.currentTarget as HTMLElement;

            target.setPointerCapture(e.pointerId);
            const rect = stageRef.current!.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startOffX = image.imageOffsetXPct;
            const startOffY = image.imageOffsetYPct;
            const scale = image.imageScalePct;
            const SNAP = 1.5;
            const move = (ev: PointerEvent) => {
              const dx = ((ev.clientX - startX) / rect.width) * 100;
              const dy = ((ev.clientY - startY) / rect.height) * 100;
              let nextX = startOffX + dx;
              let nextY = startOffY + dy;

              const half = (100 - scale) / 2;
              const leftEdge = half + nextX;
              const rightEdge = half + nextX + scale;
              const topEdge = half + nextY;
              const bottomEdge = half + nextY + scale;

              const nearLeft = Math.abs(leftEdge) < SNAP;
              const nearRight = Math.abs(rightEdge - 100) < SNAP;
              const nearTop = Math.abs(topEdge) < SNAP;
              const nearBottom = Math.abs(bottomEdge - 100) < SNAP;
              const nearHCenter = Math.abs(nextX) < SNAP;
              const nearVCenter = Math.abs(nextY) < SNAP;

              setGuides({
                top: nearTop,
                right: nearRight,
                bottom: nearBottom,
                left: nearLeft,
                hCenter: nearHCenter,
                vCenter: nearVCenter,
              });

              if (nearLeft) nextX = -half;
              else if (nearRight) nextX = half;
              else if (nearHCenter) nextX = 0;

              if (nearTop) nextY = -half;
              else if (nearBottom) nextY = half;
              else if (nearVCenter) nextY = 0;

              onMoveImage(nextX, nextY);
            };
            const up = (ev: PointerEvent) => {
              try { target.releasePointerCapture(ev.pointerId); } catch {}
              setGuides({ top: false, right: false, bottom: false, left: false, hCenter: false, vCenter: false });
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          style={{
            width: `${image.imageScalePct}%`,
            height: `${image.imageScalePct}%`,
            left: `calc(${(100 - image.imageScalePct) / 2}% + ${image.imageOffsetXPct}%)`,
            top: `calc(${(100 - image.imageScalePct) / 2}% + ${image.imageOffsetYPct}%)`,
          }}
        /></div>}
        {(() => {
          const s = image.height > 0 ? displaySize.h / image.height : 1;
          const topX = watermarkX(image.width, WATERMARK_TOP.width, WATERMARK_TOP.hOffset, watermarkTop.align);
          const botX = watermarkX(image.width, WATERMARK_BOTTOM.width, WATERMARK_BOTTOM.hOffset, watermarkBottom.align);
          return (
            <>
              <img
                src={watermarkDataUrl(WATERMARK_TOP_SVG, watermarkTop.color)}
                alt=""
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  width: WATERMARK_TOP.width * s,
                  height: WATERMARK_TOP.height * s,
                  top: WATERMARK_TOP.offset * s,
                  left: topX * s,
                }}
              />
              <img
                src={watermarkDataUrl(WATERMARK_BOTTOM_SVG, watermarkBottom.color)}
                alt=""
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  width: WATERMARK_BOTTOM.width * s,
                  height: WATERMARK_BOTTOM.height * s,
                  bottom: WATERMARK_BOTTOM.offset * s,
                  left: botX * s,
                }}
              />
            </>
          );
        })()}
        {objGuides.v.map((x, i) => (
          <div
            key={`ov${i}`}
            className="absolute pointer-events-none z-50"
            style={{ left: `${x}%`, top: 0, width: 1, height: "100%", backgroundColor: "#FF1493" }}
          />
        ))}
        {objGuides.h.map((y, i) => (
          <div
            key={`oh${i}`}
            className="absolute pointer-events-none z-50"
            style={{ top: `${y}%`, left: 0, height: 1, width: "100%", backgroundColor: "#FF1493" }}
          />
        ))}
        {guides.left && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ left: 0, top: 0, width: 1, height: "100%", backgroundColor: "#FF1493" }}
          />
        )}
        {guides.right && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ right: 0, top: 0, width: 1, height: "100%", backgroundColor: "#FF1493" }}
          />
        )}
        {guides.top && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ top: 0, left: 0, height: 1, width: "100%", backgroundColor: "#FF1493" }}
          />
        )}
        {guides.bottom && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ bottom: 0, left: 0, height: 1, width: "100%", backgroundColor: "#FF1493" }}
          />
        )}
        {guides.vCenter && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ left: "50%", top: 0, width: 1, height: "100%", transform: "translateX(-50%)", backgroundColor: "#FF1493" }}
          />
        )}
        {guides.hCenter && (
          <div
            className="absolute pointer-events-none z-50"
            style={{ top: "50%", left: 0, height: 1, width: "100%", transform: "translateY(-50%)", backgroundColor: "#FF1493" }}
          />
        )}
        {measure && (() => {
          const px = (p: number, axis: "x" | "y") =>
            Math.round((p / 100) * (axis === "x" ? image.width : image.height));
          const line = "absolute pointer-events-none z-50 bg-[#FF1493]";
          const label = "absolute z-50 pointer-events-none text-[10px] font-medium px-1 rounded bg-[#FF1493] text-white whitespace-nowrap";
          const cxPct = measure.x + measure.w / 2;
          const cyPct = measure.y + measure.h / 2;
          return (
            <>
              {/* left */}
              <div className={line} style={{ left: 0, top: `${cyPct}%`, width: `${measure.left}%`, height: 1 }} />
              <div className={label} style={{ left: `${measure.left / 2}%`, top: `${cyPct}%`, transform: "translate(-50%, -130%)" }}>{px(measure.left, "x")}</div>
              {/* right */}
              <div className={line} style={{ right: 0, top: `${cyPct}%`, width: `${measure.right}%`, height: 1 }} />
              <div className={label} style={{ left: `${100 - measure.right / 2}%`, top: `${cyPct}%`, transform: "translate(-50%, -130%)" }}>{px(measure.right, "x")}</div>
              {/* top */}
              <div className={line} style={{ top: 0, left: `${cxPct}%`, height: `${measure.top}%`, width: 1 }} />
              <div className={label} style={{ left: `${cxPct}%`, top: `${measure.top / 2}%`, transform: "translate(6px, -50%)" }}>{px(measure.top, "y")}</div>
              {/* bottom */}
              <div className={line} style={{ bottom: 0, left: `${cxPct}%`, height: `${measure.bottom}%`, width: 1 }} />
              <div className={label} style={{ left: `${cxPct}%`, top: `${100 - measure.bottom / 2}%`, transform: "translate(6px, -50%)" }}>{px(measure.bottom, "y")}</div>
            </>
          );
        })()}
        {altDown && !measure && selectedLayerId && hoverLayerId && hoverLayerId !== selectedLayerId && (() => {
          const a = image.layers.find((l) => l.id === selectedLayerId);
          const b = image.layers.find((l) => l.id === hoverLayerId);
          if (!a || !b) return null;
          const box = (l: TextLayer) => ({
            l: l.xPct, r: l.xPct + l.widthPct, t: l.yPct, b: l.yPct + l.heightPct,
          });
          const A = box(a);
          const B = box(b);
          const px = (p: number, axis: "x" | "y") =>
            Math.round((p / 100) * (axis === "x" ? image.width : image.height));
          const line = "absolute pointer-events-none z-50 bg-[#FF1493]";
          const label = "absolute z-50 pointer-events-none text-[10px] font-medium px-1 rounded bg-[#FF1493] text-white whitespace-nowrap";
          const out: JSX.Element[] = [];

          // Horizontal gap
          const gapX = B.l > A.r ? { from: A.r, to: B.l } : A.l > B.r ? { from: B.r, to: A.l } : null;
          if (gapX) {
            const y = (Math.max(A.t, B.t) + Math.min(A.b, B.b)) / 2;
            const yy = Math.max(A.t, B.t) < Math.min(A.b, B.b) ? y : (A.t + A.b + B.t + B.b) / 4;
            const d = gapX.to - gapX.from;
            out.push(
              <div key="gx" className={line} style={{ left: `${gapX.from}%`, top: `${yy}%`, width: `${d}%`, height: 1 }} />,
              <div key="gxl" className={label} style={{ left: `${gapX.from + d / 2}%`, top: `${yy}%`, transform: "translate(-50%, -130%)" }}>{px(d, "x")}</div>
            );
          }
          // Vertical gap
          const gapY = B.t > A.b ? { from: A.b, to: B.t } : A.t > B.b ? { from: B.b, to: A.t } : null;
          if (gapY) {
            const x = (Math.max(A.l, B.l) + Math.min(A.r, B.r)) / 2;
            const xx = Math.max(A.l, B.l) < Math.min(A.r, B.r) ? x : (A.l + A.r + B.l + B.r) / 4;
            const d = gapY.to - gapY.from;
            out.push(
              <div key="gy" className={line} style={{ top: `${gapY.from}%`, left: `${xx}%`, height: `${d}%`, width: 1 }} />,
              <div key="gyl" className={label} style={{ left: `${xx}%`, top: `${gapY.from + d / 2}%`, transform: "translate(6px, -50%)" }}>{px(d, "y")}</div>
            );
          }
          // When the boxes overlap on an axis, show the edge offsets on that axis
          // (e.g. stacked vertically => also show the left/right offsets).
          if (!gapX) {
            const y = (Math.max(A.t, B.t) + Math.min(A.b, B.b)) / 2;
            const dl = A.l - B.l;
            const dr = B.r - A.r;
            if (Math.abs(dl) > 0.01) {
              const from = Math.min(A.l, B.l);
              out.push(
                <div key="elx" className={line} style={{ left: `${from}%`, top: `${y}%`, width: `${Math.abs(dl)}%`, height: 1 }} />,
                <div key="elxl" className={label} style={{ left: `${from + Math.abs(dl) / 2}%`, top: `${y}%`, transform: "translate(-50%, -130%)" }}>{px(Math.abs(dl), "x")}</div>
              );
            }
            if (Math.abs(dr) > 0.01) {
              const from = Math.min(A.r, B.r);
              out.push(
                <div key="erx" className={line} style={{ left: `${from}%`, top: `${y}%`, width: `${Math.abs(dr)}%`, height: 1 }} />,
                <div key="erxl" className={label} style={{ left: `${from + Math.abs(dr) / 2}%`, top: `${y}%`, transform: "translate(-50%, -130%)" }}>{px(Math.abs(dr), "x")}</div>
              );
            }
          }
          if (!gapY) {
            const x = (Math.max(A.l, B.l) + Math.min(A.r, B.r)) / 2;
            const dt = A.t - B.t;
            const db = B.b - A.b;
            if (Math.abs(dt) > 0.01) {
              const from = Math.min(A.t, B.t);
              out.push(
                <div key="ety" className={line} style={{ top: `${from}%`, left: `${x}%`, height: `${Math.abs(dt)}%`, width: 1 }} />,
                <div key="etyl" className={label} style={{ left: `${x}%`, top: `${from + Math.abs(dt) / 2}%`, transform: "translate(6px, -50%)" }}>{px(Math.abs(dt), "y")}</div>
              );
            }
            if (Math.abs(db) > 0.01) {
              const from = Math.min(A.b, B.b);
              out.push(
                <div key="eby" className={line} style={{ top: `${from}%`, left: `${x}%`, height: `${Math.abs(db)}%`, width: 1 }} />,
                <div key="ebyl" className={label} style={{ left: `${x}%`, top: `${from + Math.abs(db) / 2}%`, transform: "translate(6px, -50%)" }}>{px(Math.abs(db), "y")}</div>
              );
            }
          }

          // Highlight the hovered layer box
          out.push(
            <div
              key="hl"
              className="absolute pointer-events-none z-40 outline outline-1 outline-[#FF1493]"
              style={{ left: `${B.l}%`, top: `${B.t}%`, width: `${B.r - B.l}%`, height: `${B.b - B.t}%` }}
            />
          );
          return <>{out}</>;
        })()}
        {toolBox && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: `${toolBox.x}%`,
              top: `${toolBox.y}%`,
              width: `${toolBox.w}%`,
              height: `${toolBox.h}%`,
            }}
          >
            {tool === "text" ? (
              <div className="w-full h-full border border-dashed border-[#2F6FED]" />
            ) : tool === "line" ? (
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-[#2B2C2E]" />
            ) : (
              <div
                className={`w-full h-full bg-[#2B2C2E]/70 ${tool === "ellipse" ? "rounded-full" : ""}`}
              />
            )}
          </div>
        )}
        {marquee && (
          <div
            className="absolute z-50 pointer-events-none border border-[#2F6FED] bg-[#2F6FED]/10"
            style={{
              left: `${marquee.x}%`,
              top: `${marquee.y}%`,
              width: `${marquee.w}%`,
              height: `${marquee.h}%`,
            }}
          />
        )}
        {selectedLayerIds.length > 1 && (() => {
          const sel = image.layers.filter((l) => selectedLayerIds.includes(l.id));
          if (sel.length < 2) return null;
          const l0 = Math.min(...sel.map((l) => l.xPct));
          const t0 = Math.min(...sel.map((l) => l.yPct));
          const r0 = Math.max(...sel.map((l) => l.xPct + l.widthPct));
          const b0 = Math.max(...sel.map((l) => l.yPct + l.heightPct));
          return (
            <div
              className="absolute z-40 pointer-events-none border-2 border-[#2F6FED]"
              style={{ left: `${l0}%`, top: `${t0}%`, width: `${r0 - l0}%`, height: `${b0 - t0}%` }}
            />
          );
        })()}
        {image.layers.map((l) => {
          const isSelected = selectedLayerIds.includes(l.id);
          const isSingleSelected = selectedLayerIds.length === 1 && isSelected;
          const isEditing = l.id === editingLayerId;
          const scale = image.height > 0 ? displaySize.h / image.height : 1;
          const fontSizePx = l.fontSizePx * scale;
          const textStyle: React.CSSProperties = {
            fontFamily: "Comico, system-ui",
            fontSize: `${fontSizePx}px`,
            color: l.color,
            lineHeight: LINE_HEIGHT,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
            textAlign: l.align,
          };
          const isCropping = crop?.id === l.id;
          return (
            <div
              key={l.id}
              className={`absolute ${isSelected ? "outline outline-2 outline-accent" : ""}`}
              data-editing-layer={isEditing ? "true" : undefined}
              data-crop-box={isCropping ? "true" : undefined}
              onPointerEnter={() => setHoverLayerId(l.id)}
              onPointerLeave={() => setHoverLayerId((cur) => (cur === l.id ? null : cur))}
              style={{
                left: `${l.xPct}%`,
                top: `${l.yPct}%`,
                width: `${l.widthPct}%`,
                height: `${l.heightPct}%`,
                transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
                transformOrigin: "center center",
              }}

            >
              {l.kind === "shape" ? (
                l.shape === "line" ? (
                  <div
                    onPointerDown={(e) => onPointerDown(e, l.id)}
                    className="w-full h-full cursor-move flex items-center"
                  >
                    <div
                      className="w-full"
                      style={{
                        height: `${Math.max(1, (l.strokeWidth ?? 1) * scale)}px`,
                        background: l.stroke ?? "#2B2C2E",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    onPointerDown={(e) => onPointerDown(e, l.id)}
                    className="w-full h-full cursor-move"
                    style={{
                      background: l.fill ?? "transparent",
                      border: l.stroke ? `${Math.max(1, (l.strokeWidth ?? 1) * scale)}px solid ${l.stroke}` : undefined,
                      borderRadius:
                        l.shape === "ellipse" ? "9999px" : `${(l.radiusPx ?? 0) * scale}px`,
                      boxSizing: "border-box",
                    }}
                  />
                )
              ) : l.kind === "image" ? (

                <>
                  <img
                    src={l.src}
                    alt={l.name || "Image layer"}
                    draggable={false}
                    onPointerDown={(e) => { if (!isCropping) onPointerDown(e, l.id); }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectLayer(l.id);
                      setCrop({ id: l.id, x: 0, y: 0, w: 1, h: 1 });
                    }}
                    className={`w-full h-full select-none ${isCropping ? "cursor-default" : "cursor-move"}`}
                    style={{ objectFit: "fill" }}
                  />
                  {isCropping && crop && (
                    <div className="absolute inset-0 z-40" onPointerDown={(e) => e.stopPropagation()}>
                      {/* Dim the area outside the crop rect */}
                      <div className="absolute bg-black/50 pointer-events-none" style={{ left: 0, top: 0, width: "100%", height: `${crop.y * 100}%` }} />
                      <div className="absolute bg-black/50 pointer-events-none" style={{ left: 0, top: `${(crop.y + crop.h) * 100}%`, width: "100%", bottom: 0 }} />
                      <div className="absolute bg-black/50 pointer-events-none" style={{ left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.h * 100}%` }} />
                      <div className="absolute bg-black/50 pointer-events-none" style={{ left: `${(crop.x + crop.w) * 100}%`, top: `${crop.y * 100}%`, right: 0, height: `${crop.h * 100}%` }} />
                      <div
                        className="absolute outline outline-2 outline-accent cursor-move"
                        style={{
                          left: `${crop.x * 100}%`,
                          top: `${crop.y * 100}%`,
                          width: `${crop.w * 100}%`,
                          height: `${crop.h * 100}%`,
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => cropPointerDown(e, "move")}
                        onDoubleClick={(e) => { e.stopPropagation(); applyCrop(); }}
                      >
                        {CROP_HANDLES.map((h) => (
                          <div
                            key={h.dir}
                            onPointerDown={(e) => cropPointerDown(e, h.dir)}
                            className={`absolute w-2.5 h-2.5 bg-accent border border-background rounded-sm ${h.pos} ${h.cursor}`}
                            style={{ touchAction: "none" }}
                            aria-label={`Crop ${h.dir}`}
                          />
                        ))}
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 -bottom-9 flex gap-1 z-50">
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); applyCrop(); }}
                          className="px-2 py-1 text-[11px] rounded bg-accent text-accent-foreground shadow"
                        >
                          Apply
                        </button>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setCrop(null); }}
                          className="px-2 py-1 text-[11px] rounded bg-background text-foreground border border-border shadow"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : isEditing ? (
                <textarea
                  autoFocus
                  defaultValue={l.text}
                  ref={(el) => {
                    if (el) growEditor(el, l.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onInput={(e) => growEditor(e.currentTarget, l.id)}
                  onBlur={(e) => {
                    onEditLayerText(l.id, e.currentTarget.value);
                    setEditingLayerId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full h-full bg-transparent outline-none resize-none border-none p-0 m-0 overflow-hidden"
                  style={{ ...textStyle, caretColor: l.color }}
                />

              ) : (
                <div
                  data-layer-text={l.id}
                  onPointerDown={(e) => onPointerDown(e, l.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelectLayer(l.id);
                    setEditingLayerId(l.id);
                  }}
                  className="cursor-move w-full h-full"
                  style={textStyle}
                >
                  {l.text || " "}
                </div>
              )}
              {isSingleSelected && !isEditing && !isCropping && (
                <div
                  onPointerDown={(e) => onRotatePointerDown(e, l.id)}
                  className="absolute w-3 h-3 rounded-full bg-background border-2 border-accent cursor-grab left-1/2 -translate-x-1/2 -top-7"
                  style={{ touchAction: "none" }}
                  aria-label="Rotate layer"
                  title="Drag to rotate (hold Shift for 15° steps)"
                />
              )}
              {isSingleSelected && !isEditing && !isCropping &&
                HANDLES.map((h) => (
                  <div
                    key={h.dir}
                    onPointerDown={(e) => onResizePointerDown(e, l.id, h.dir)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const horizontal = h.dir === "w" || h.dir === "e";
                      const vertical = h.dir === "n" || h.dir === "s";
                      fitLayerBox(l.id, horizontal ? "w" : vertical ? "h" : "both");
                    }}
                    className={`absolute w-2.5 h-2.5 bg-accent border border-background rounded-sm ${h.pos} ${h.cursor}`}
                    style={{ touchAction: "none" }}
                    aria-label={`Resize ${h.dir}`}
                  />
                ))}
            </div>
          );

        })}
      </div>
    </div>
  );
};

export default Editor;
