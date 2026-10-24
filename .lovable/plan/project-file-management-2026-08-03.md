# Project file management

Turn the editor into a multi-project app: a home page with a grid of saved projects, cloud-backed so your work follows you between iPad and desktop.

## What you get

**Home page (`/`)**
- Grid of project cards: preview thumbnail of the first slide, project title, "Edited 2 days ago".
- "New project" card to start a blank one.
- Card menu: rename, duplicate, delete.
- Sorted by most recently edited.

**Editor (`/p/:projectId`)**
- Same editor as today, now scoped to one project.
- Editable project title in the header, plus a back arrow to the grid.
- Autosave to the cloud (debounced, same as the current local autosave), with a small "Saved / Saving…" indicator.
- Local IndexedDB save stays as an offline safety net so an accidental back-swipe never loses work; it syncs up when the connection returns.

**Sign in**
- Email + password and Google sign-in.
- Projects are private to your account.
- Visiting the app while signed out shows the sign-in screen.

## Migration of current work

On first sign-in, if there is existing editor state in this browser's local save, it is imported as a project named "Untitled project" so nothing is lost.

## Technical notes

- Auth: Lovable Cloud auth (email/password + Google). No profile table needed unless you want display names later.
- Table `projects`: `id`, `user_id`, `title`, `data` (jsonb — slides, text layers, watermark settings), `thumbnail_path`, `created_at`, `updated_at` with an update trigger. RLS + grants scoped to `auth.uid()`.
- Slide images are today stored as base64 inside state, which is too large for a jsonb row. Images move to a private Storage bucket `project-images` (path `<user_id>/<project_id>/<image_id>.jpg`); the project JSON stores paths and the editor resolves signed URLs on load. Existing base64 images in a local save get uploaded during import.
- Thumbnails: the first slide is rendered to a small JPEG on save and uploaded to the same bucket.
- Editor state (`images`, `selectedId`, `selectedLayerId`) is lifted so `Editor.tsx` receives/returns a project payload instead of owning global persistence.
- Routes: `/` (grid), `/p/:projectId` (editor), `/auth` (sign in/up), all guarded by a session check.
