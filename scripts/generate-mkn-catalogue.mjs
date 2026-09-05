import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const [sourceArgument, outputArgument = "public/data/mkn-10-cz-2026.json"] = process.argv.slice(2);

if (!sourceArgument) {
  throw new Error(
    "Usage: node scripts/generate-mkn-catalogue.mjs <official-uzis-csv> [output-json]",
  );
}

const sourcePath = resolve(sourceArgument);
const outputPath = resolve(outputArgument);
const diagnoses = [];

const input = createInterface({
  input: createReadStream(sourcePath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let isHeader = true;
for await (const line of input) {
  if (isHeader) {
    isHeader = false;
    continue;
  }

  const [chapter, group, rawCode, code, ...labelParts] = line.split(";");
  let label = labelParts.join(";").trim();
  if (label.startsWith('"') && label.endsWith('"')) {
    label = label.slice(1, -1).replaceAll('""', '"');
  }
  if (!code || !label || !/^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,2})?$/.test(code)) continue;

  diagnoses.push({
    code,
    label,
    chapter,
    group,
    terminal: rawCode.length > 3,
  });
}

await mkdir(dirname(outputPath), { recursive: true });
const output = createWriteStream(outputPath, { encoding: "utf8" });
output.write(
  JSON.stringify({
    version: "MKN-10-CZ 2026",
    validFrom: "2026-01-01",
    source: "ÚZIS ČR",
    sourceUrl:
      "https://www.uzis.cz/res/f/008465/mkn-10-strukturovane-podklady-20260101.zip",
    generatedAt: "2026-09-04",
    count: diagnoses.length,
    diagnoses,
  }),
);
output.end();

await new Promise((resolvePromise, rejectPromise) => {
  output.on("finish", resolvePromise);
  output.on("error", rejectPromise);
});

console.log(`Generated ${diagnoses.length} MKN-10-CZ entries at ${outputPath}`);
