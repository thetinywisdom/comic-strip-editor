import {
  localCreate,
  localDelete,
  localDuplicate,
  localGet,
  localList,
  localSave,
} from "@/lib/localProjects";

export type ProjectSummary = {
  id: string;
  title: string;
  thumbnail: string | null;
  updated_at: string;
  created_at: string;
};

// Structural shape of a slide as stored in the project payload. The editor owns
// the full type; here we only care about the image source fields.
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

export type ProjectData = {
  images: StoredSlide[];
  selectedId: string | null;
  selectedLayerId: string | null;
};

/**
 * GitHub Pages production builds keep projects in IndexedDB.
 * The cloud module is loaded only for the authenticated Supabase client.
 */
const browserStore = import.meta.env.VITE_STATIC_PUBLIC === "true";

async function cloud() {
  return import("@/lib/projectsCloud");
}

/**
 * On the static site, image data stays inline in the project record.
 * The cloud client uploads data URLs to storage before saving the row.
 */
export async function serializeProject(
  userId: string,
  projectId: string,
  data: ProjectData
): Promise<ProjectData> {
  if (browserStore) return data;
  const api = await cloud();
  return api.serializeProject(userId, projectId, data);
}

/** Downloads a single stored asset and returns it as an inline data URL. */
export async function downloadAsset(path: string): Promise<string> {
  if (browserStore) return "";
  const api = await cloud();
  return api.downloadAsset(path);
}

/** Resolves stored slide images into inline data URLs for the editor. */
export async function hydrateProject(data: ProjectData): Promise<ProjectData> {
  if (browserStore) return data;
  const api = await cloud();
  return api.hydrateProject(data);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (browserStore) return localList();
  const api = await cloud();
  return api.listProjects();
}

export async function createProject(title = "Untitled project"): Promise<string> {
  if (browserStore) return localCreate(title);
  const api = await cloud();
  return api.createProject(title);
}

export async function getProject(id: string) {
  if (browserStore) return localGet(id);
  const api = await cloud();
  return api.getProject(id);
}

export async function saveProject(
  id: string,
  payload: { data?: ProjectData; title?: string; thumbnail?: string | null }
) {
  if (browserStore) return localSave(id, payload);
  const api = await cloud();
  return api.saveProject(id, payload);
}

export async function deleteProject(id: string) {
  if (browserStore) return localDelete(id);
  const api = await cloud();
  return api.deleteProject(id);
}

export async function duplicateProject(id: string): Promise<string> {
  if (browserStore) return localDuplicate(id);
  const api = await cloud();
  return api.duplicateProject(id);
}

/**
 * Cloud builds copy older IndexedDB projects into Supabase once.
 * The static site is the browser store, so there is nothing to migrate.
 */
export async function migrateLocalProjects(): Promise<number> {
  if (browserStore) return 0;
  const api = await cloud();
  return api.migrateLocalProjects();
}

export function formatEdited(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "Edited just now";
  if (min < 60) return `Edited ${min} minute${min === 1 ? "" : "s"} ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `Edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `Edited ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `Edited ${years} year${years === 1 ? "" : "s"} ago`;
}
