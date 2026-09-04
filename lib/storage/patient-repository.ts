import type { Patient } from "../registry-model";

const REGISTRY_SCHEMA_VERSION = 2;
const REGISTRY_MARKER_FILE = "onkoflow-registry.json";
const PATIENTS_DIRECTORY = "patients";
const AUDIT_DIRECTORY = "audit";
const BACKUPS_DIRECTORY = "backups";

export type PatientRecord = {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
};

export type RepositoryAuditEvent = {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  id: string;
  timestamp: string;
  actor: string;
  category: "Vytvoření" | "Změna";
  action: string;
  patientId: string;
  revision: number;
};

export type LoadedRegistry = {
  patients: Patient[];
  revisions: Record<string, number>;
  auditEvents: RepositoryAuditEvent[];
  warnings: string[];
};

type RegistryMarker = {
  application: "OnkoFlow";
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  createdAt: string;
};

export class PatientRevisionConflictError extends Error {
  readonly patientId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(
    patientId: string,
    expectedRevision: number,
    actualRevision: number,
  ) {
    super(
      `Záznam byl mezitím změněn na jiném počítači (očekávaná revize ${expectedRevision}, aktuální ${actualRevision}). Obnovte registr a změnu zopakujte.`,
    );
    this.patientId = patientId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.name = "PatientRevisionConflictError";
  }
}

export class DuplicateBirthNumberError extends Error {
  constructor() {
    super("Pacient se stejným rodným číslem už v registru existuje.");
    this.name = "DuplicateBirthNumberError";
  }
}

export class RegistryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryDataError";
  }
}

function normalizeBirthNumber(value: string) {
  return value.replace(/\D/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTimelineEvent(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.date === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.author === "string" &&
    typeof value.status === "string" &&
    (value.time === undefined || typeof value.time === "string")
  );
}

function isPatient(value: unknown): value is Patient {
  if (!isRecord(value)) return false;
  const requiredStrings = [
    "id",
    "initials",
    "firstName",
    "lastName",
    "birthNumber",
    "dateOfBirth",
    "primaryDiagnosisCode",
    "primaryDiagnosisLabel",
    "diagnosisCertainty",
    "intakeDate",
    "biopsyStatus",
    "phase",
    "physician",
    "nextStep",
    "nextStepDate",
    "priority",
  ];

  if (!requiredStrings.every((key) => typeof value[key] === "string")) return false;
  if (!isStringArray(value.secondaryDiagnoses)) return false;
  if (!isStringArray(value.stagingExaminations)) return false;
  if (
    value.stagingDetails !== undefined &&
    (!Array.isArray(value.stagingDetails) ||
      !value.stagingDetails.every(
        (item) =>
          isRecord(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.date === "string" &&
          typeof item.result === "string",
      ))
  ) {
    return false;
  }
  if (!Array.isArray(value.events) || !value.events.every(isTimelineEvent)) return false;
  if (typeof value.progress !== "number" || typeof value.recurrence !== "boolean") return false;
  if (value.mdtDate !== null && typeof value.mdtDate !== "string") return false;
  if (value.mdtConclusion !== undefined && typeof value.mdtConclusion !== "string") return false;
  if (value.treatmentRoute !== null && typeof value.treatmentRoute !== "string") return false;
  if (value.treatmentSite !== null && typeof value.treatmentSite !== "string") return false;
  if (value.biopsyResult !== null) {
    if (!isRecord(value.biopsyResult)) return false;
    if (
      typeof value.biopsyResult.date !== "string" ||
      typeof value.biopsyResult.facility !== "string" ||
      typeof value.biopsyResult.reportReference !== "string" ||
      typeof value.biopsyResult.conclusion !== "string"
    ) {
      return false;
    }
  }
  return true;
}

function parsePatientRecord(value: unknown, expectedPatientId?: string): PatientRecord {
  if (!isRecord(value)) throw new RegistryDataError("Soubor pacienta nemá platný formát.");
  if (value.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new RegistryDataError(
      `Nepodporovaná verze datového schématu: ${String(value.schemaVersion)}.`,
    );
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) {
    throw new RegistryDataError("Záznam pacienta nemá platnou revizi.");
  }
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    throw new RegistryDataError("Záznam pacienta nemá platné časové údaje.");
  }
  if (!isPatient(value.patient)) {
    throw new RegistryDataError("Záznam pacienta je neúplný nebo poškozený.");
  }
  if (expectedPatientId && value.patient.id !== expectedPatientId) {
    throw new RegistryDataError("Identifikátor pacienta neodpovídá názvu souboru.");
  }
  return value as PatientRecord;
}

function parseAuditEvent(value: unknown): RepositoryAuditEvent {
  if (!isRecord(value) || value.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new RegistryDataError("Auditní soubor nemá platný formát.");
  }
  const requiredStrings = ["id", "timestamp", "actor", "category", "action", "patientId"];
  if (!requiredStrings.every((key) => typeof value[key] === "string")) {
    throw new RegistryDataError("Auditní soubor je neúplný.");
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) {
    throw new RegistryDataError("Auditní soubor nemá platnou revizi.");
  }
  return value as RepositoryAuditEvent;
}

async function readText(fileHandle: FileSystemFileHandle) {
  return (await fileHandle.getFile()).text();
}

async function writeText(fileHandle: FileSystemFileHandle, content: string) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

async function writeJsonVerified(
  fileHandle: FileSystemFileHandle,
  value: unknown,
  verify: (parsed: unknown) => void,
) {
  await writeText(fileHandle, `${JSON.stringify(value, null, 2)}\n`);
  const parsed = JSON.parse(await readText(fileHandle)) as unknown;
  verify(parsed);
}

async function getOptionalFile(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await directory.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

async function initializeRegistry(directory: FileSystemDirectoryHandle) {
  const markerHandle = await getOptionalFile(directory, REGISTRY_MARKER_FILE);
  if (markerHandle) {
    const marker = JSON.parse(await readText(markerHandle)) as Partial<RegistryMarker>;
    if (marker.application !== "OnkoFlow" || marker.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
      throw new RegistryDataError(
        "Vybraná složka obsahuje jinou nebo nepodporovanou verzi registru.",
      );
    }
  } else {
    const createdAt = new Date().toISOString();
    const newMarker = await directory.getFileHandle(REGISTRY_MARKER_FILE, { create: true });
    await writeJsonVerified(
      newMarker,
      { application: "OnkoFlow", schemaVersion: REGISTRY_SCHEMA_VERSION, createdAt },
      (parsed) => {
        if (!isRecord(parsed) || parsed.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
          throw new RegistryDataError("Inicializaci datové složky se nepodařilo ověřit.");
        }
      },
    );
  }

  const [patients, audit, backups] = await Promise.all([
    directory.getDirectoryHandle(PATIENTS_DIRECTORY, { create: true }),
    directory.getDirectoryHandle(AUDIT_DIRECTORY, { create: true }),
    directory.getDirectoryHandle(BACKUPS_DIRECTORY, { create: true }),
  ]);
  return { patients, audit, backups };
}

async function loadPatientRecords(patientsDirectory: FileSystemDirectoryHandle) {
  const records: PatientRecord[] = [];
  const warnings: string[] = [];
  for await (const entry of patientsDirectory.values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    try {
      const patientId = entry.name.slice(0, -5);
      const parsed = JSON.parse(await readText(entry as FileSystemFileHandle)) as unknown;
      records.push(parsePatientRecord(parsed, patientId));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Neznámá chyba.";
      warnings.push(`${entry.name}: ${detail}`);
    }
  }
  return { records, warnings };
}

async function loadAuditEvents(auditDirectory: FileSystemDirectoryHandle) {
  const events: RepositoryAuditEvent[] = [];
  const warnings: string[] = [];
  for await (const entry of auditDirectory.values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readText(entry as FileSystemFileHandle)) as unknown;
      events.push(parseAuditEvent(parsed));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Neznámá chyba.";
      warnings.push(`${entry.name}: ${detail}`);
    }
  }
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { events: events.slice(0, 500), warnings };
}

async function appendAuditEvent(
  auditDirectory: FileSystemDirectoryHandle,
  event: RepositoryAuditEvent,
) {
  const filename = `${event.timestamp.replaceAll(":", "-")}-${event.id}.json`;
  const fileHandle = await auditDirectory.getFileHandle(filename, { create: true });
  if ((await readText(fileHandle)).trim()) {
    throw new RegistryDataError("Auditní událost se stejným identifikátorem už existuje.");
  }
  await writeJsonVerified(fileHandle, event, (parsed) => {
    const verified = parseAuditEvent(parsed);
    if (verified.id !== event.id) throw new RegistryDataError("Zápis auditu se nepodařilo ověřit.");
  });
}

export async function loadRegistry(directory: FileSystemDirectoryHandle): Promise<LoadedRegistry> {
  const registry = await initializeRegistry(directory);
  const [patientResult, auditResult] = await Promise.all([
    loadPatientRecords(registry.patients),
    loadAuditEvents(registry.audit),
  ]);
  const revisions: Record<string, number> = {};
  for (const record of patientResult.records) revisions[record.patient.id] = record.revision;
  patientResult.records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    patients: patientResult.records.map((record) => record.patient),
    revisions,
    auditEvents: auditResult.events,
    warnings: [...patientResult.warnings, ...auditResult.warnings],
  };
}

export async function createPatientRecord(
  directory: FileSystemDirectoryHandle,
  patient: Patient,
  actor: string,
) {
  const registry = await initializeRegistry(directory);
  const { records, warnings } = await loadPatientRecords(registry.patients);
  if (warnings.length) {
    throw new RegistryDataError(
      "Nový záznam nelze vytvořit, dokud datová složka obsahuje poškozený soubor pacienta.",
    );
  }
  if (
    records.some(
      (record) =>
        normalizeBirthNumber(record.patient.birthNumber) === normalizeBirthNumber(patient.birthNumber),
    )
  ) {
    throw new DuplicateBirthNumberError();
  }
  if (await getOptionalFile(registry.patients, `${patient.id}.json`)) {
    throw new RegistryDataError("Záznam pacienta se stejným identifikátorem už existuje.");
  }

  const timestamp = new Date().toISOString();
  const record: PatientRecord = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    patient,
  };
  const fileHandle = await registry.patients.getFileHandle(`${patient.id}.json`, { create: true });
  await writeJsonVerified(fileHandle, record, (parsed) => parsePatientRecord(parsed, patient.id));

  const auditEvent: RepositoryAuditEvent = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    timestamp,
    actor,
    category: "Vytvoření",
    action: "Pacient přijat do péče",
    patientId: patient.id,
    revision: 1,
  };
  await appendAuditEvent(registry.audit, auditEvent);
  return { record, auditEvent };
}

export async function updatePatientRecord(
  directory: FileSystemDirectoryHandle,
  patient: Patient,
  expectedRevision: number,
  action: string,
  actor: string,
) {
  const registry = await initializeRegistry(directory);
  const fileHandle = await registry.patients.getFileHandle(`${patient.id}.json`);
  const existingText = await readText(fileHandle);
  const existing = parsePatientRecord(JSON.parse(existingText) as unknown, patient.id);
  if (existing.revision !== expectedRevision) {
    throw new PatientRevisionConflictError(patient.id, expectedRevision, existing.revision);
  }

  const backupHandle = await registry.backups.getFileHandle(
    `${patient.id}-r${existing.revision}.json`,
    { create: true },
  );
  if (!(await readText(backupHandle)).trim()) {
    await writeText(backupHandle, existingText);
  }

  const timestamp = new Date().toISOString();
  const record: PatientRecord = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    revision: existing.revision + 1,
    createdAt: existing.createdAt,
    updatedAt: timestamp,
    patient,
  };
  await writeJsonVerified(fileHandle, record, (parsed) => parsePatientRecord(parsed, patient.id));

  const auditEvent: RepositoryAuditEvent = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    timestamp,
    actor,
    category: "Změna",
    action,
    patientId: patient.id,
    revision: record.revision,
  };
  await appendAuditEvent(registry.audit, auditEvent);
  return { record, auditEvent };
}

export function explainRepositoryError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  return "Neznámá chyba datového úložiště.";
}

export const registrySchemaVersion = REGISTRY_SCHEMA_VERSION;
