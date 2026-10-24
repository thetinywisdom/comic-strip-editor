import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getProject, hydrateProject } from "@/lib/projects";
import { renderProjectSlides, type RenderableSlide } from "@/lib/slideRender";

type Props = {
  projectId: string;
  title: string;
  onClose: () => void;
};

const Slideshow = ({ projectId, title, onClose }: Props) => {
  const [slides, setSlides] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const project = await getProject(projectId);
        if (!project) throw new Error("Project not found");
        const data = await hydrateProject(project.data as never);
        const rendered = await renderProjectSlides(
          (data.images ?? []) as unknown as RenderableSlide[]
        );
        if (!cancelled) setSlides(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load slides");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const count = slides?.length ?? 0;
  const next = useCallback(() => setIndex((i) => (count ? (i + 1) % count : 0)), [count]);
  const prev = useCallback(() => setIndex((i) => (count ? (i - 1 + count) % count : 0)), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-sm truncate">{title}</span>
        <div className="flex items-center gap-3">
          {count > 0 && (
            <span className="text-xs tabular-nums">
              {index + 1} / {count}
            </span>
          )}
          <button onClick={onClose} aria-label="Close slideshow" className="hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-6 gap-4">
        {count > 1 && (
          <button onClick={prev} aria-label="Previous slide" className="text-white/60 hover:text-white">
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}
        <div className="flex-1 h-full flex items-center justify-center">
          {error ? (
            <p className="text-sm text-white/70">{error}</p>
          ) : !slides ? (
            <p className="text-sm text-white/70">Loading slides…</p>
          ) : count === 0 ? (
            <p className="text-sm text-white/70">This project has no slides yet.</p>
          ) : (
            <img
              src={slides[index]}
              alt={`${title} slide ${index + 1}`}
              className="max-h-full max-w-full object-contain"
              onClick={next}
            />
          )}
        </div>
        {count > 1 && (
          <button onClick={next} aria-label="Next slide" className="text-white/60 hover:text-white">
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Slideshow;
