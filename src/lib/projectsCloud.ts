import { supabase } from "@/integrations/supabase/client";
import { localDelete, localGet, localList } from "@/lib/localProjects";
import type { ProjectData, ProjectSummary } from "@/lib/projects";

const BUCKET = "project-images";

// Single shared workspace: this tool has no accounts, every browser reads and
// writes the same set of projects in the cloud database.
const SHARED_USER_ID = "00000000-0000-0000-0000-000000000000";

type StoredLayer = {
  id: string;
  src?: string;
  srcPath?: string;
  [key: string]: unknown;
};

type StoredSlide = {
  id: string;
  url?: string;
  storagePath?: string;
  layers?: StoredLayer[];
  [key: string]: unknown;
};

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const uploadDataUrl = async (dataUrl: string, path: string) => {
  const blob = await dataUrlToBlob(dataUrl);
  const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
  const fullPath = `${path}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  return fullPath;
};

/**
 * Uploads any inline (data URL) slide and layer images to storage and replaces
 * them with a storage path, so the project row stays small.
 */
export async function serializeProject(
  _userId: string,
  projectId: string,
  data: ProjectData
): Promise<ProjectData> {
  const images: StoredSlide[] = [];
  for (const slide of data.images) {
    let next: StoredSlide = { ...slide };

    if (!slide.storagePath && slide.url && slide.url.startsWith("data:")) {
      const path = await uploadDataUrl(slide.url, `${SHARED_USER_ID}/${projectId}/${slide.id}`);
      next = { ...next, url: "", storagePath: path };
    } else {
      next = { ...next, url: slide.storagePath ? "" : slide.url ?? "" };
    }

    if (Array.isArray(slide.layers)) {
      const layers: StoredLayer[] = [];
      for (const layer of slide.layers) {
        if (!layer.srcPath && layer.src && layer.src.startsWith("data:")) {
          const path = await uploadDataUrl(
            layer.src,
            `${SHARED_USER_ID}/${projectId}/${slide.id}-${layer.id}`
          );
          layers.push({ ...layer, src: "", srcPath: path });
        } else if (layer.srcPath) {
          layers.push({ ...layer, src: "" });
        } else {
          layers.push(layer);
        }
      }
      next = { ...next, layers };
    }

    images.push(next);
  }
  return { ...data, images };
}

/** Downloads a single stored asset and returns it as an inline data URL. */
export async function downloadAsset(path: string): Promise<string> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !blob) return "";
  return blobToDataUrl(blob);
}

/** Downloads stored slide images back into inline data URLs for the editor. */
export async function hydrateProject(data: ProjectData): Promise<ProjectData> {
  const images = await Promise.all(
    (data.images ?? []).map(async (slide) => {
      const url = slide.storagePath ? await downloadAsset(slide.storagePath) : slide.url;
      const layers = slide.layers
        ? await Promise.all(
            slide.layers.map(async (l) =>
              l.srcPath ? { ...l, src: await downloadAsset(l.srcPath) } : l
            )
          )
        : slide.layers;
      return { ...slide, url, ...(layers ? { layers } : {}) };
    })
  );
  return { ...data, images };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,title,thumbnail,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(title = "Untitled project"): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: SHARED_USER_ID,
      title,
      data: { images: [], selectedId: null, selectedLayerId: null },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function getProject(id: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id,title,data,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProject(
  id: string,
  payload: { data?: ProjectData; title?: string; thumbnail?: string | null }
) {
  const patch: Record<string, unknown> = {};
  if (payload.data !== undefined) patch.data = payload.data;
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.thumbnail !== undefined) patch.thumbnail = payload.thumbnail;
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateProject(id: string): Promise<string> {
  const { data: source, error } = await supabase
    .from("projects")
    .select("title,data,thumbnail")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: created, error: insertError } = await supabase
    .from("projects")
    .insert({
      user_id: SHARED_USER_ID,
      title: `${source.title} copy`,
      data: source.data,
      thumbnail: source.thumbnail,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

const MIGRATED_KEY = "tw-local-projects-migrated";

/**
 * One-time migration: pushes projects that were stored in this browser
 * (IndexedDB) up to the shared cloud database, then clears them locally.
 */
export async function migrateLocalProjects(): Promise<number> {
  if (localStorage.getItem(MIGRATED_KEY) === "1") return 0;
  let moved = 0;
  try {
    const rows = await localList();
    for (const row of rows) {
      const full = await localGet(row.id);
      if (!full) continue;
      const newId = await createProject(row.title);
      const data = await serializeProject(SHARED_USER_ID, newId, full.data);
      await saveProject(newId, { data, thumbnail: row.thumbnail });
      await localDelete(row.id);
      moved += 1;
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Leave local data intact so the migration can be retried next load.
  }
  return moved;
}
