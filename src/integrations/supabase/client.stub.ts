// Stand-in for the static GitHub Pages bundle.
// The real client, publishable key, and Supabase URL stay out of that build.
export const supabase = new Proxy({} as Record<string, never>, {
  get() {
    throw new Error("Supabase is not included in the static Pages build.");
  },
});
