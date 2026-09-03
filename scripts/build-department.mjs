import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function readGitValue(args, fallback) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  return result.status === 0 ? result.stdout.trim() : fallback;
}

const commitBase = readGitValue(["rev-parse", "--short=12", "HEAD"], "unknown");
const dirtyState = readGitValue(["status", "--porcelain"], "");
const commit = dirtyState ? `${commitBase}-dirty` : commitBase;
const buildDate = new Date().toISOString();
const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const result = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    ONKOFLOW_DEPARTMENT_BUILD: "1",
    ONKOFLOW_BUILD_COMMIT: commit,
    ONKOFLOW_BUILD_DATE: buildDate,
  },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`Department build se nepodařilo spustit: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const exportedIndex = join(process.cwd(), "out", "index.html");
const indexHtml = readFileSync(exportedIndex, "utf8");
const fileCompatibleHtml = indexHtml.replaceAll(
  /\/icon\.svg\?[^"\\]+/g,
  "./icon.svg",
);
writeFileSync(exportedIndex, fileCompatibleHtml, "utf8");

const pwaVerification = spawnSync(
  process.execPath,
  [join(process.cwd(), "scripts", "verify-pwa-export.mjs")],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  },
);

if (pwaVerification.error) {
  console.error(`PWA kontrolu nelze spustit: ${pwaVerification.error.message}`);
  process.exit(1);
}

if (pwaVerification.status !== 0) {
  process.exit(pwaVerification.status ?? 1);
}

console.log("\nDepartment build je připraven v adresáři out.");
console.log(`Commit: ${commit}`);
console.log(`Build:  ${buildDate}`);
