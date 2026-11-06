import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Project-site path for https://thetinywisdom.github.io/comic-strip-editor/
const pagesBase = "/comic-strip-editor/";

/** GitHub Pages serves /404.html for unknown paths and keeps the deep URL. */
function githubPagesSpaFallback(): Plugin {
  return {
    name: "github-pages-spa-fallback",
    apply: "build",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const indexPath = path.join(dist, "index.html");
      if (!fs.existsSync(indexPath)) return;
      fs.copyFileSync(indexPath, path.join(dist, "404.html"));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  const staticPublic = (process.env.VITE_STATIC_PUBLIC ?? fileEnv.VITE_STATIC_PUBLIC) === "true";

  return {
    base: mode === "development" ? "/" : pagesBase,
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      mode !== "development" && githubPagesSpaFallback(),
    ].filter(Boolean),
    resolve: {
      alias: [
        ...(staticPublic
          ? [
              {
                find: "@/integrations/supabase/client",
                replacement: path.resolve(__dirname, "./src/integrations/supabase/client.stub.ts"),
              },
            ]
          : []),
        { find: "@", replacement: path.resolve(__dirname, "./src") },
      ],
    },
  };
});
