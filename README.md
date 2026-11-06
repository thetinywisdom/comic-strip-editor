# Comic Strip Editor

## GitHub Pages

The production build is a static site for `https://thetinywisdom.github.io/comic-strip-editor/`.

`npm run build` sets Vite's `base` to `/comic-strip-editor/`, bundles the Comico font and logotype from `src/assets` (the Lovable `/__l5e/` URLs are not used), copies `public/` files, and writes `dist/404.html` as a copy of `index.html` so deep links such as `/comic-strip-editor/p/:projectId` load the app. `npm run dev` stays at `/` and still uses the Supabase client when `.env` is present.

`.github/workflows/pages.yml` installs dependencies in the runner, builds, checks the output, and deploys with GitHub Actions on every push to `main`. Dependencies and server secrets are not committed. Public values the frontend already reads can be overridden with repository **variables** or **secrets** of these names (a secret wins when both are set; an empty value leaves the committed `.env` in place):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_STATIC_PUBLIC`

Do not add `SUPABASE_SERVICE_ROLE_KEY` or `LOVABLE_API_KEY`. Those stay on the Supabase/Lovable server.

This workflow does not change the Lovable project, its Supabase database, or the `editor.thetinywisdom.com` domain.

### What the static site does

With `VITE_STATIC_PUBLIC=true` (the committed `.env.production` default), projects are stored in this browser's IndexedDB. Creating, renaming, duplicating, deleting, editing, slideshow playback, and image download all run locally. A failed browser write is reported as a failed save.

### What still needs the existing backend

These pieces are left unwired on Pages. The static UI does not pretend they succeeded.

- **Sign-in email.** The cloud UI calls the deployed `request-login` function. That function keeps the service role on the server and asks Supabase Auth to email a magic link. The return URL has to be on the Supabase redirect allow list, which today serves `https://editor.thetinywisdom.com`. This deployment leaves that allow list unchanged, so a Pages origin cannot finish sign-in. Public sign-up is disabled. The static build does not show a sign-in form.
- **Shared projects and image storage.** After the later migrations, the `anon` role cannot read `public.projects` (the API returns permission denied). Project rows and the `project-images` bucket require an authenticated user who passes `is_allowed()`.
- **Access list and admin role.** `allowed_emails`, `is_admin`, and `is_allowed` are for signed-in users.
- **Email queue.** `process-email-queue` rejects the publishable key (`403 Forbidden`). It needs the service role and `LOVABLE_API_KEY`, and Pages cannot run it.
- **Lovable OAuth helper.** `src/integrations/lovable` is unused by the screen the app actually shows. It is not connected to this host.

Set repository variable `VITE_STATIC_PUBLIC` to `false` only after the Supabase redirect allow list includes `https://thetinywisdom.github.io/comic-strip-editor/`. That setting is a Lovable/Supabase change and is outside this deployment. Until then the Pages build stays on the browser store.

### Turning on Pages

GitHub Free serves Pages for a public repository. A private user repository needs GitHub Pro, and this setup does not change the account plan or add a custom domain. `editor.thetinywisdom.com` stays on Lovable.

Publishing uses GitHub Actions as the source (`build_type=workflow`). The workflow builds on pull requests and deploys on every push to `main`. Switching the repository to public and creating the Pages site both require `administration=write` on the calling token. The Actions workflow token cannot create the Pages site by itself.

# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
