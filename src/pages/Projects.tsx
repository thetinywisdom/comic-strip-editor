import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Copy, Trash2, ArrowUpRight, ChevronDown, Wrench, Users, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AccessDialog from "@/components/AccessDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TOOLS = [
  { name: "Blog to Carousel", url: "https://slides.thetinywisdom.com" },
  { name: "Blog to Quotes", url: "https://tweet.thetinywisdom.com" },
  { name: "Blog Thumbnail Editor", url: "https://thumbnail.thetinywisdom.com" },
  { name: "Comic Strip Editor", url: "https://editor.thetinywisdom.com" },
];
import { toast } from "sonner";
import logotypeAsset from "@/assets/logotype.svg.asset.json";
import {
  createProject,
  deleteProject,
  duplicateProject,
  formatEdited,
  listProjects,
  migrateLocalProjects,
  saveProject,
  serializeProject,
  type ProjectSummary,
} from "@/lib/projects";
import { clearLocal, loadLocal } from "@/lib/localSave";
import Slideshow from "@/components/Slideshow";

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [playing, setPlaying] = useState<ProjectSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data, error }) => {
      setIsAdmin(!error && data === true);
    });
  }, []);


  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const moved = await migrateLocalProjects();
      if (moved > 0) toast.success(`Moved ${moved} local project${moved === 1 ? "" : "s"} to the cloud`);
      await refresh();
    })();
  }, [refresh]);


  const onNew = async () => {
    try {
      const id = await createProject();
      navigate(`/p/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    }
  };

  const commitRename = async (id: string) => {
    const title = renameValue.trim() || "Untitled project";
    setRenamingId(null);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
    try {
      await saveProject(id, { title });
    } catch {
      toast.error("Could not rename project");
      refresh();
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <a
            href="https://thetinywisdom.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 hover:opacity-90 transition"
          >
            <img src={logotypeAsset.url} alt="The Tiny Wisdom" className="h-7 w-auto" />
          </a>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition outline-none">
                <Wrench className="h-4 w-4" />
                Tools
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {TOOLS.map((tool) => (
                  <DropdownMenuItem key={tool.url} asChild>
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span>{tool.name}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {isAdmin && (
              <AccessDialog
                trigger={
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <Users className="h-4 w-4" />
                    Access
                  </Button>
                }
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => supabase.auth.signOut()}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <button
              onClick={onNew}
              className="aspect-[4/5] rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm">New project</span>
            </button>

            {projects.map((p) => (
              <div key={p.id} className="group">
                <div className="relative w-full aspect-[4/5] rounded-lg border border-border overflow-hidden bg-muted hover:border-foreground/40 transition-colors">
                  <button
                    onClick={() => navigate(`/p/${p.id}`)}
                    className="w-full h-full"
                  >
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt={`${p.title} preview`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Empty project</span>
                    )}
                  </button>
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Play ${p.title} slideshow`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlaying(p);
                      }}
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label="Duplicate project"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await duplicateProject(p.id);
                          refresh();
                        } catch {
                          toast.error("Could not duplicate project");
                        }
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 text-destructive"
                        aria-label="Delete project"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete "${p.title}"?`)) return;
                          try {
                            await deleteProject(p.id);
                            setProjects((prev) => prev.filter((x) => x.id !== p.id));
                          } catch {
                            toast.error("Could not delete project");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}

                  </div>
                </div>
                <div className="mt-2 min-w-0">
                  {renamingId === p.id ? (
                    <div className="relative">
                      <input
                        autoFocus
                        className="w-full block text-sm font-medium leading-5 bg-transparent border-0 rounded-none p-0 m-0 focus:outline-none focus:ring-0"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(p.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                      <span className="pointer-events-none absolute left-0 right-0 -bottom-px h-px bg-foreground/30" />
                    </div>
                  ) : (
                    <p
                      className="text-sm font-medium truncate cursor-pointer"
                      onDoubleClick={() => {
                        setRenameValue(p.title);
                        setRenamingId(p.id);
                      }}
                    >
                      {p.title}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{formatEdited(p.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {playing && (
        <Slideshow
          projectId={playing.id}
          title={playing.title}
          onClose={() => setPlaying(null)}
        />
      )}
    </main>
  );
};

export default Projects;
