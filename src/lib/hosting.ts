/** Production Pages builds set this in `.env.production`. Dev builds leave it unset. */
export const staticPublic = import.meta.env.VITE_STATIC_PUBLIC === "true";

/**
 * React Router basename for the GitHub Pages project site.
 * Vite's BASE_URL keeps a trailing slash; React Router wants it omitted.
 * Dev (`base: "/"`) uses the default basename.
 */
export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL || "/";
  if (base === "/") return undefined;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
