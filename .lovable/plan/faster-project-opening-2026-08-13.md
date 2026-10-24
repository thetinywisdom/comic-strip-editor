# Faster project opening

Opening a project takes several seconds and the canvas/layer list stays empty until everything finishes.

## What's actually happening

- Slide background images are already stored as files, but **image layers are still stored inline as base64 inside the project row**. Confirmed in the database: one project's row is 3.7 MB, with single layers of 2.8 MB, 0.5 MB and 0.45 MB. That whole blob has to download and JSON-parse before anything renders.
- After the row loads, every stored slide image is downloaded and converted back to base64 before the editor state is set. Nothing is shown until the last one finishes.
- The editor renders nothing at all while loading, so it looks broken rather than loading.

## The fix

**1. Store image-layer files like slide images**
On save, upload any `data:` image-layer source to the images bucket and keep only the path in the project row. Rows drop from megabytes to a few kilobytes. Existing projects get converted automatically the first time they are saved.

**2. Show layers immediately**
Set the artboards and layer list as soon as the project row arrives, then fill in the pictures as each one downloads. Layer names, text, shapes and positions appear right away; images pop in a moment later.

**3. Loading state**
Show a skeleton/spinner in the sidebar and canvas while the row is being fetched, so it never looks like an empty project.

## Technical notes

- `src/lib/projects.ts`: extend `serializeProject` / `hydrateProject` to walk `slide.layers[]` and handle layer `src` the same way as slide `url` (`storagePath` field, upload/download via the `project-images` bucket). Reuse the existing shared-workspace path prefix.
- `src/pages/Editor.tsx`: split the load effect — `setImages(stored.images)` first (with empty image sources), then hydrate asynchronously and patch sources in per slide/layer as they resolve, keyed by id so in-flight edits are not clobbered.
- Guard autosave so it does not fire from the hydration patches (keep the existing `hydratedRef` gate and only flip it after the initial JSON is applied).
- Keep the local IndexedDB safety-net behaviour unchanged.
- No schema change needed; storage bucket and policies already exist.
