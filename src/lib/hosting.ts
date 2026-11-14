/** Production Pages builds set this in `.env.production`. Dev builds leave it unset. */
export const staticPublic = import.meta.env.VITE_STATIC_PUBLIC === "true";

/**
 * Router basename for the production site at the domain root.
 * Vite's BASE_URL is "/" for https://editor.thetinywisdom.com/.
 */
export function routerBasename(): string {
  const base = import.meta.env.BASE_URL || "/";
  if (base === "/") return "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
