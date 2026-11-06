// Browser project store for the static GitHub Pages build.
// Mirrors the cloud API in projects.ts and persists to IndexedDB.
import { clearLocalStrict, loadLocal, saveLocalStrict } from "@/lib/localSave";
import type { ProjectData, ProjectSummary } from "@/lib/projects";

type LocalProject = ProjectSummary & { data: ProjectData };

const INDEX_KEY = "local-projects-index";
const projectKey = (id: string) => `local-project-${id}`;

const emptyData = (): ProjectData => ({ images: [], selectedId: null, selectedLayerId: null });

async function readIndex(): Promise<string[]> {
  return (await loadLocal<string[]>(INDEX_KEY)) ?? [];
}

async function writeIndex(ids: string[]) {
  await saveLocalStrict(ids, INDEX_KEY);
}

export async function localList(): Promise<ProjectSummary[]> {
  const ids = await readIndex();
  const rows = await Promise.all(ids.map((id) => loadLocal<LocalProject>(projectKey(id))));
  return rows
    .filter((r): r is LocalProject => !!r)
    .map(({ id, title, thumbnail, created_at, updated_at }) => ({
      id,
      title,
      thumbnail,
      created_at,
      updated_at,
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function localCreate(title = "Untitled project"): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const project: LocalProject = {
    id,
    title,
    thumbnail: null,
    created_at: now,
    updated_at: now,
    data: emptyData(),
  };
  await saveLocalStrict(project, projectKey(id));
  await writeIndex([id, ...(await readIndex())]);
  return id;
}

export async function localGet(id: string) {
  const row = await loadLocal<LocalProject>(projectKey(id));
  if (!row) return null;
  return { id: row.id, title: row.title, data: row.data, updated_at: row.updated_at };
}

export async function localSave(
  id: string,
  payload: { data?: ProjectData; title?: string; thumbnail?: string | null }
) {
  const row = await loadLocal<LocalProject>(projectKey(id));
  if (!row) return;
  const next: LocalProject = {
    ...row,
    ...(payload.data !== undefined ? { data: payload.data } : {}),
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.thumbnail !== undefined ? { thumbnail: payload.thumbnail } : {}),
    updated_at: new Date().toISOString(),
  };
  await saveLocalStrict(next, projectKey(id));
}

export async function localDelete(id: string) {
  await clearLocalStrict(projectKey(id));
  await writeIndex((await readIndex()).filter((x) => x !== id));
}

export async function localDuplicate(id: string): Promise<string> {
  const row = await loadLocal<LocalProject>(projectKey(id));
  if (!row) throw new Error("Project not found");
  const newId = await localCreate(`${row.title} copy`);
  await localSave(newId, { data: row.data, thumbnail: row.thumbnail });
  return newId;
}
