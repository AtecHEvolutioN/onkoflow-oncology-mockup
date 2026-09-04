import assert from "node:assert/strict";
import test from "node:test";
import {
  advancePatientThroughWorkflow,
  getWorkflowAdvanceAction,
} from "../lib/workflow.ts";

function createMdtPatient() {
  return {
    id: "patient-mdt",
    initials: "AN",
    firstName: "Alena",
    lastName: "Nová",
    birthNumber: "900101/0007",
    dateOfBirth: "1990-01-01",
    primaryDiagnosisCode: "C54.1",
    primaryDiagnosisLabel: "Zhoubný novotvar endometria",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-08-01",
    biopsyStatus: "Provedena v ÚVN",
    biopsyResult: {
      date: "2026-08-05",
      facility: "ÚVN Praha",
      reportReference: "H-1/2026",
      conclusion: "Endometroidní karcinom",
    },
    stagingExaminations: ["CT"],
    stagingDetails: [
      { id: "ct", name: "CT", date: "2026-08-10", result: "Bez vzdálených metastáz" },
    ],
    mdtDate: null,
    mdtConclusion: "",
    treatmentRoute: null,
    treatmentSite: null,
    recurrence: false,
    phase: "MDT",
    progress: 65,
    physician: "Uživatel oddělení",
    nextStep: "Naplánovat MDT",
    nextStepDate: "2026-09-04",
    priority: "Běžná",
    events: [],
  };
}

function transitionInput(treatmentRoute) {
  return {
    date: "2026-09-04",
    note: "",
    biopsyStatus: null,
    biopsyResult: null,
    stagingExaminations: [],
    treatmentRoute,
  };
}

test("stores an MDT treatment decision as a Terapie modifier", () => {
  const updated = advancePatientThroughWorkflow(
    createMdtPatient(),
    transitionInput("Neoadjuvantní léčba"),
    "tester",
  );

  assert.ok(updated);
  assert.equal(updated.phase, "Terapie");
  assert.equal(updated.treatmentRoute, "Neoadjuvantní léčba");
  assert.equal(getWorkflowAdvanceAction(updated)?.targetLabel, "Terapie · Primární operace");
});

test("changes the therapy modifier without creating another major stage", () => {
  const therapyPatient = {
    ...createMdtPatient(),
    phase: "Terapie",
    treatmentRoute: "Neoadjuvantní léčba",
  };
  const updated = advancePatientThroughWorkflow(
    therapyPatient,
    transitionInput(null),
    "tester",
  );

  assert.ok(updated);
  assert.equal(updated.phase, "Terapie");
  assert.equal(updated.treatmentRoute, "Primární operace");
});
