import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogue = JSON.parse(
  await readFile(new URL("../public/data/mkn-10-cz-2026.json", import.meta.url), "utf8"),
);

test("bundles the complete official MKN-10-CZ 2026 catalogue", () => {
  assert.equal(catalogue.version, "MKN-10-CZ 2026");
  assert.equal(catalogue.validFrom, "2026-01-01");
  assert.equal(catalogue.source, "ÚZIS ČR");
  assert.equal(catalogue.count, 16119);
  assert.equal(catalogue.diagnoses.length, 16119);
});

test("contains exact coded diagnoses needed by the registry", () => {
  const c541 = catalogue.diagnoses.find((diagnosis) => diagnosis.code === "C54.1");
  const n800 = catalogue.diagnoses.find((diagnosis) => diagnosis.code === "N80.0");
  const b1800 = catalogue.diagnoses.find((diagnosis) => diagnosis.code === "B18.00");

  assert.equal(c541?.label, "Zhoubný novotvar - endometrium - sliznice");
  assert.match(n800?.label ?? "", /Endometrióza/);
  assert.equal(
    b1800?.label,
    "Chronická virová hepatitida B s Delta agens; fáze imunotolerance",
  );
});
