import assert from "node:assert/strict";
import test from "node:test";
import {
  getBiopsyDisplayStatus,
  getExaminationDisplayStatus,
  getMdtDisplayStatus,
  getStagingDisplayStatus,
} from "../lib/workflow-status.ts";

const today = "2026-09-04";
const patient = {
  biopsyResult: null,
  stagingDetails: [],
  mdtDate: null,
  mdtConclusion: "",
};

test("calculates biopsy waiting modifiers from date and result", () => {
  assert.equal(getBiopsyDisplayStatus(patient, today), "Biopsie nenaplánována");
  assert.equal(
    getBiopsyDisplayStatus({ ...patient, biopsyResult: { date: "2026-09-05", facility: "ÚVN", reportReference: "", conclusion: "" } }, today),
    "Čekání na termín biopsie",
  );
  assert.equal(
    getBiopsyDisplayStatus({ ...patient, biopsyResult: { date: today, facility: "ÚVN", reportReference: "", conclusion: "" } }, today),
    "Dnes biopsie",
  );
  assert.equal(
    getBiopsyDisplayStatus({ ...patient, biopsyResult: { date: "2026-09-03", facility: "ÚVN", reportReference: "", conclusion: "" } }, today),
    "Čekání na výsledek biopsie",
  );
  assert.equal(
    getBiopsyDisplayStatus({ ...patient, biopsyResult: { date: "2026-09-03", facility: "ÚVN", reportReference: "", conclusion: "Histologie" } }, today),
    "Výsledek biopsie k dispozici",
  );
});

test("calculates each staging examination status and aggregate completion", () => {
  const future = { id: "1", name: "CT", date: "2026-09-05", result: "" };
  const present = { id: "2", name: "MRI", date: today, result: "" };
  const past = { id: "3", name: "PET/CT", date: "2026-09-03", result: "" };
  assert.equal(getExaminationDisplayStatus(future, today), "Čekání na termín");
  assert.equal(getExaminationDisplayStatus(present, today), "Vyšetření dnes");
  assert.equal(getExaminationDisplayStatus(past, today), "Čekání na výsledek");
  assert.equal(getStagingDisplayStatus({ ...patient, stagingDetails: [future, present] }, today), "Vyšetření dnes");
  assert.equal(
    getStagingDisplayStatus({ ...patient, stagingDetails: [{ ...future, result: "Bez metastáz" }] }, today),
    "Výsledky kompletní (1/1)",
  );
});

test("calculates MDT status before, on and after the planned date", () => {
  assert.equal(getMdtDisplayStatus(patient, today), "MDT nenaplánováno");
  assert.equal(getMdtDisplayStatus({ ...patient, mdtDate: "2026-09-05" }, today), "Čekání na MDT");
  assert.equal(getMdtDisplayStatus({ ...patient, mdtDate: today }, today), "MDT dnes");
  assert.equal(getMdtDisplayStatus({ ...patient, mdtDate: "2026-09-03" }, today), "Čekání na závěr MDT");
  assert.equal(getMdtDisplayStatus({ ...patient, mdtDate: "2026-09-03", mdtConclusion: "Primární operace" }, today), "MDT dokončeno");
});
