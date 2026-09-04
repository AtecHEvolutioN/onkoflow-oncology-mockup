import assert from "node:assert/strict";
import test from "node:test";
import {
  DuplicateBirthNumberError,
  PatientRevisionConflictError,
  createPatientRecord,
  loadRegistry,
  updatePatientRecord,
} from "../lib/storage/patient-repository.ts";

class MemoryFileHandle {
  kind = "file";

  constructor(name) {
    this.name = name;
    this.content = "";
  }

  async getFile() {
    return { text: async () => this.content };
  }

  async createWritable() {
    let nextContent = "";
    return {
      write: async (value) => {
        nextContent = String(value);
      },
      close: async () => {
        this.content = nextContent;
      },
    };
  }
}

class MemoryDirectoryHandle {
  kind = "directory";

  constructor(name = "data") {
    this.name = name;
    this.entries = new Map();
  }

  async getFileHandle(name, options = {}) {
    const existing = this.entries.get(name);
    if (existing?.kind === "file") return existing;
    if (!options.create) throw new DOMException("Not found", "NotFoundError");
    const file = new MemoryFileHandle(name);
    this.entries.set(name, file);
    return file;
  }

  async getDirectoryHandle(name, options = {}) {
    const existing = this.entries.get(name);
    if (existing?.kind === "directory") return existing;
    if (!options.create) throw new DOMException("Not found", "NotFoundError");
    const directory = new MemoryDirectoryHandle(name);
    this.entries.set(name, directory);
    return directory;
  }

  async *values() {
    yield* this.entries.values();
  }
}

function createPatient(id = "patient-1", birthNumber = "900101/0007") {
  return {
    id,
    initials: "AN",
    firstName: "Alena",
    lastName: "Nová",
    birthNumber,
    dateOfBirth: "1990-01-01",
    primaryDiagnosisCode: "C54.1",
    primaryDiagnosisLabel: "Zhoubný novotvar endometria",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Suspektní",
    intakeDate: "2026-09-04",
    biopsyStatus: "Nutno provést",
    biopsyResult: null,
    stagingExaminations: [],
    stagingDetails: [],
    mdtDate: null,
    mdtConclusion: "",
    treatmentRoute: null,
    treatmentSite: null,
    recurrence: false,
    phase: "Biopsie",
    progress: 20,
    physician: "Uživatel oddělení",
    nextStep: "Biopsie nenaplánována",
    nextStepDate: "2026-09-11",
    priority: "Běžná",
    events: [],
  };
}

test("initializes an empty registry and persists a verified patient record", async () => {
  const directory = new MemoryDirectoryHandle();
  const empty = await loadRegistry(directory);
  assert.deepEqual(empty.patients, []);
  assert.equal(empty.warnings.length, 0);

  const created = await createPatientRecord(directory, createPatient(), "tester");
  assert.equal(created.record.revision, 1);

  const loaded = await loadRegistry(directory);
  assert.equal(loaded.patients.length, 1);
  assert.equal(loaded.patients[0].birthNumber, "900101/0007");
  assert.equal(loaded.revisions["patient-1"], 1);
  assert.equal(loaded.auditEvents.length, 1);
});

test("rejects a duplicate rodné číslo", async () => {
  const directory = new MemoryDirectoryHandle();
  await createPatientRecord(directory, createPatient(), "tester");
  await assert.rejects(
    createPatientRecord(directory, createPatient("patient-2", "9001010007"), "tester"),
    DuplicateBirthNumberError,
  );
});

test("increments revisions, creates a backup and rejects a stale update", async () => {
  const directory = new MemoryDirectoryHandle();
  const patient = createPatient();
  await createPatientRecord(directory, patient, "tester");
  const updated = {
    ...patient,
    nextStep: "Čekání na termín biopsie",
    stagingExaminations: ["CT", "CA 125"],
    stagingDetails: [
      { id: "exam-ct", name: "CT", date: "2026-09-12", result: "Bez metastáz" },
      { id: "exam-ca125", name: "CA 125", date: "2026-09-08", result: "42 kU/l" },
    ],
    mdtDate: "2026-09-10",
    mdtDetails: {
      surgeryPerformed: "Ano",
      surgeryDate: "2026-08-25",
      surgeryDiagnosis: "Karcinom endometria",
      operator: "MUDr. Test",
      histologyType: "Endometroidní karcinom",
      histologyNumber: "H-123/2026",
      histologyGrade: "G2",
      recommendedImaging: "CT",
      imagingIntervalMonths: "6",
      imagingDate: "2027-03-10",
      imagingSite: "ÚVN",
      checkupDate: "2026-10-10",
      oncologist: "MUDr. Onkolog",
      nationalOncologyRegistry: "Hlášení připraveno",
      karnofsky: "90",
      attendees: "Gynekolog, onkolog, radiolog, patolog",
    },
  };

  const saved = await updatePatientRecord(directory, updated, 1, "Biopsie aktualizována", "tester");
  assert.equal(saved.record.revision, 2);

  await assert.rejects(
    updatePatientRecord(directory, { ...updated, progress: 30 }, 1, "Stará změna", "tester"),
    PatientRevisionConflictError,
  );

  const loaded = await loadRegistry(directory);
  assert.equal(loaded.revisions[patient.id], 2);
  assert.equal(loaded.patients[0].mdtDetails.operator, "MUDr. Test");
  assert.equal(loaded.patients[0].mdtDate, "2026-09-10");
  assert.equal(loaded.patients[0].stagingDetails[1].result, "42 kU/l");
  assert.equal(loaded.auditEvents.length, 2);
  const backups = await directory.getDirectoryHandle("backups");
  assert.equal(backups.entries.has("patient-1-r1.json"), true);
});
