import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "out");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(output, "manifest.webmanifest"), "utf8"));
const serviceWorker = readFileSync(join(output, "sw.js"), "utf8");
const index = readFileSync(join(output, "index.html"), "utf8");

function requireCondition(condition, message) {
  if (!condition) throw new Error(`PWA verification failed: ${message}`);
}

requireCondition(manifest.start_url === "/", "manifest start_url must be /");
requireCondition(manifest.scope === "/", "manifest scope must be /");
requireCondition(manifest.display === "standalone", "manifest display must be standalone");
requireCondition(index.includes('rel="manifest"'), "index.html does not link the manifest");
requireCondition(index.includes("/sw.js"), "index.html does not register the service worker");
requireCondition(
  serviceWorker.includes(`const CACHE_VERSION = "${packageJson.version}"`),
  "service-worker cache version does not match package.json",
);

for (const icon of manifest.icons ?? []) {
  const iconPath = join(output, icon.src.replace(/^\//, ""));
  requireCondition(existsSync(iconPath), `manifest icon is missing: ${icon.src}`);
}

const localAssets = Array.from(index.matchAll(/(?:src|href)="([^"]+)"/g))
  .map((match) => match[1])
  .filter((value) => !value.startsWith("data:") && !value.startsWith("http"))
  .map((value) => value.split("?", 1)[0].replace(/^\.\//, "").replace(/^\//, ""));

for (const asset of localAssets) {
  requireCondition(existsSync(join(output, asset)), `referenced asset is missing: ${asset}`);
}

console.log(`PWA export verified for OnkoFlow ${packageJson.version}.`);
