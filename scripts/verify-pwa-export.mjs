import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
requireCondition(index.includes("Přihlášení"), "index.html does not render the login gate");
requireCondition(
  index.includes('autoComplete="current-password"'),
  "login gate does not contain the password field",
);
requireCondition(
  !index.includes('autoComplete="username"'),
  "login gate still contains the removed user field",
);
requireCondition(
  !index.includes("login-security-note"),
  "login gate still contains the removed disclaimer",
);
requireCondition(
  serviceWorker.includes(`const CACHE_VERSION = "${packageJson.version}"`),
  "service-worker cache version does not match package.json",
);
requireCondition(
  serviceWorker.includes('"/data/mkn-10-cz-2026.json"'),
  "service worker does not precache the offline MKN catalogue",
);
requireCondition(
  existsSync(join(output, "brand-logo.png")) && existsSync(join(output, "brand-symbol.png")),
  "ÚVN brand assets are missing from the export",
);

const mknCatalogue = JSON.parse(
  readFileSync(join(output, "data", "mkn-10-cz-2026.json"), "utf8"),
);
requireCondition(mknCatalogue.version === "MKN-10-CZ 2026", "wrong MKN catalogue version");
requireCondition(mknCatalogue.count === 16119, "MKN catalogue is incomplete");
requireCondition(
  mknCatalogue.diagnoses.some(
    (diagnosis) => diagnosis.code === "C54.1" && diagnosis.label.includes("endometrium"),
  ),
  "MKN catalogue is missing C54.1",
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

function collectTextAssets(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTextAssets(path);
    if (!statSync(path).isFile() || !/\.(?:css|html|js|json|map|txt|webmanifest)$/.test(path)) {
      return [];
    }
    return [path];
  });
}

const plaintextPilotPassword = ["onko", "uvn1"].join("");
for (const path of collectTextAssets(output)) {
  requireCondition(
    !readFileSync(path, "utf8").includes(plaintextPilotPassword),
    `plaintext pilot password leaked into exported asset: ${path}`,
  );
}

console.log(`PWA export verified for OnkoFlow ${packageJson.version}.`);
