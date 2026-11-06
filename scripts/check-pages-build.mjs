import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const indexPath = path.join(dist, "index.html");
const notFoundPath = path.join(dist, "404.html");
const base = "/comic-strip-editor/";
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

if (!fs.existsSync(indexPath)) fail("dist/index.html is missing");
if (!fs.existsSync(notFoundPath)) fail("dist/404.html is missing");

if (fs.existsSync(indexPath) && fs.existsSync(notFoundPath)) {
  const index = fs.readFileSync(indexPath, "utf8");
  const notFound = fs.readFileSync(notFoundPath, "utf8");
  if (index !== notFound) fail("dist/404.html must be a copy of dist/index.html");
  if (!index.includes(`${base}assets/`)) fail(`index.html is missing ${base}assets/ references`);
  if (index.includes("/src/main.tsx")) fail("index.html still points at the dev module");
  if (!index.includes(`${base}favicon.ico`) && !index.includes("favicon.ico")) {
    fail("favicon link was not rewritten for the Pages base path");
  }
  const assetRefs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of assetRefs) {
    if (!ref.startsWith(base)) fail(`asset URL is missing the Pages base: ${ref}`);
    const relative = ref.slice(base.length).split("?")[0];
    const filePath = path.join(dist, relative);
    if (!fs.existsSync(filePath)) fail(`missing built file for ${ref}`);
  }
}

const files = fs.existsSync(dist) ? walk(dist) : [];
const banned = [
  "/__l5e/",
  "service_role",
  "LOVABLE_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "sb_secret_",
  "twnxurdurgarsmulqiqh",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
];

let fontReferenced = false;
let logoReferenced = false;

for (const file of files) {
  const text = fs.readFileSync(file);
  const asText = text.toString("utf8");
  for (const needle of banned) {
    if (asText.includes(needle)) fail(`${path.relative(dist, file)} contains ${needle}`);
  }
  if (file.endsWith(".css") && asText.includes("Comico") && asText.includes(`${base}assets/`)) {
    fontReferenced = true;
  }
  if (file.endsWith(".js") && /logotype-.*\.svg/.test(asText)) logoReferenced = true;
  if (file.endsWith("logotype.svg") || /logotype-.*\.svg$/.test(file)) logoReferenced = true;
}

if (!fontReferenced) fail("Comico font is not referenced from a built CSS file under the Pages base");
if (!logoReferenced) fail("logotype svg was not emitted into the build");
if (!files.some((file) => file.endsWith("favicon.ico"))) fail("public/favicon.ico was not copied");
if (!files.some((file) => file.endsWith("robots.txt"))) fail("public/robots.txt was not copied");

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pages build ok (${files.length} files, base ${base})`);
