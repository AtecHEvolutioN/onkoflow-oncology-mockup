import {
  loadDataDirectoryHandle,
  saveDataDirectoryHandle,
} from "./directory-handle-store";

export type DiagnosticStatus = "idle" | "running" | "passed" | "failed" | "blocked";

export type StorageDiagnosticId =
  | "application"
  | "secure-context"
  | "file-system-api"
  | "directory"
  | "permission"
  | "read"
  | "write"
  | "read-back"
  | "replace"
  | "delete"
  | "remember-handle"
  | "conflict";

export type StorageDiagnosticResult = {
  id: StorageDiagnosticId;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  durationMs?: number;
};

export type StorageCapability = {
  isSecureContext: boolean;
  hasDirectoryPicker: boolean;
  hasIndexedDb: boolean;
  protocol: string;
};

type DiagnosticReporter = (result: StorageDiagnosticResult) => void;

const diagnosticLabels: Record<StorageDiagnosticId, string> = {
  application: "Statická aplikace",
  "secure-context": "Bezpečný kontext",
  "file-system-api": "File System Access API",
  directory: "Datová složka vybrána",
  permission: "Oprávnění pro zápis",
  read: "Čtení adresáře",
  write: "Vytvoření testovacího souboru",
  "read-back": "Zpětné přečtení",
  replace: "Změna / nahrazení obsahu",
  delete: "Smazání testovacího souboru",
  "remember-handle": "Zapamatování directory handle",
  conflict: "Detekce konfliktu revizí",
};

export const diagnosticOrder = Object.keys(diagnosticLabels) as StorageDiagnosticId[];

export function createInitialDiagnostics(): StorageDiagnosticResult[] {
  return diagnosticOrder.map((id) => ({
    id,
    label: diagnosticLabels[id],
    status: "idle",
    detail: "Neověřeno",
  }));
}

export function getStorageCapability(): StorageCapability {
  return {
    isSecureContext: window.isSecureContext,
    hasDirectoryPicker: "showDirectoryPicker" in window,
    hasIndexedDb: "indexedDB" in window,
    protocol: window.location.protocol,
  };
}

export async function pickDataDirectory() {
  return window.showDirectoryPicker({
    id: "onkoflow-department-data",
    mode: "read",
  });
}

export function queryReadWritePermission(handle: FileSystemDirectoryHandle) {
  return handle.queryPermission({ mode: "readwrite" });
}

export function requestReadWritePermission(handle: FileSystemDirectoryHandle) {
  return handle.requestPermission({ mode: "readwrite" });
}

function explainError(error: unknown) {
  if (error instanceof DOMException) {
    return `${error.name}: ${error.message || "Operace byla odmítnuta prohlížečem."}`;
  }
  if (error instanceof Error) return error.message;
  return "Neznámá chyba.";
}

async function writeText(fileHandle: FileSystemFileHandle, content: string) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

async function readText(fileHandle: FileSystemFileHandle) {
  return (await fileHandle.getFile()).text();
}

class RevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Záznam byl změněn: očekávaná revize ${expectedRevision}, aktuální revize ${actualRevision}.`,
    );
    this.name = "RevisionConflictError";
  }
}

async function saveRevision(
  fileHandle: FileSystemFileHandle,
  expectedRevision: number,
  newRevision: number,
  writer: string,
) {
  const current = JSON.parse(await readText(fileHandle)) as { revision?: unknown };
  if (current.revision !== expectedRevision) {
    throw new RevisionConflictError(
      expectedRevision,
      typeof current.revision === "number" ? current.revision : Number.NaN,
    );
  }

  await writeText(
    fileHandle,
    JSON.stringify({ schemaVersion: 1, revision: newRevision, writer }, null, 2),
  );
}

async function reportStep(
  id: StorageDiagnosticId,
  reporter: DiagnosticReporter,
  operation: () => Promise<string>,
) {
  reporter({
    id,
    label: diagnosticLabels[id],
    status: "running",
    detail: "Probíhá…",
  });
  const started = performance.now();

  try {
    const detail = await operation();
    const result: StorageDiagnosticResult = {
      id,
      label: diagnosticLabels[id],
      status: "passed",
      detail,
      durationMs: Math.round(performance.now() - started),
    };
    reporter(result);
    return true;
  } catch (error) {
    reporter({
      id,
      label: diagnosticLabels[id],
      status: "failed",
      detail: explainError(error),
      durationMs: Math.round(performance.now() - started),
    });
    return false;
  }
}

function reportBlocked(
  id: StorageDiagnosticId,
  reporter: DiagnosticReporter,
  detail: string,
) {
  reporter({ id, label: diagnosticLabels[id], status: "blocked", detail });
}

export async function runStorageDiagnostics(
  directory: FileSystemDirectoryHandle,
  reporter: DiagnosticReporter,
  options: { staticExport: boolean },
) {
  const capability = getStorageCapability();
  reporter({
    id: "application",
    label: diagnosticLabels.application,
    status: options.staticExport ? "passed" : "blocked",
    detail: options.staticExport
      ? `Department static export a JavaScript jsou načteny; protokol ${capability.protocol}`
      : "Běží demo build; statický departmental export se zde neověřuje.",
  });
  reporter({
    id: "secure-context",
    label: diagnosticLabels["secure-context"],
    status: capability.isSecureContext ? "passed" : "failed",
    detail: capability.isSecureContext
      ? "window.isSecureContext = true"
      : "window.isSecureContext = false; prohlížeč nemusí zpřístupnit výběr složky.",
  });
  reporter({
    id: "file-system-api",
    label: diagnosticLabels["file-system-api"],
    status: capability.hasDirectoryPicker ? "passed" : "failed",
    detail: capability.hasDirectoryPicker
      ? "window.showDirectoryPicker je dostupný."
      : "window.showDirectoryPicker není dostupný.",
  });
  reporter({
    id: "directory",
    label: diagnosticLabels.directory,
    status: "passed",
    detail: `Vybrán adresář „${directory.name}“ (prohlížeč z bezpečnostních důvodů neposkytuje úplnou cestu).`,
  });

  const permissionGranted = await reportStep("permission", reporter, async () => {
    const permission = await queryReadWritePermission(directory);
    if (permission !== "granted") {
      throw new Error(`Oprávnění read/write má stav ${permission}.`);
    }
    return "Oprávnění read/write je uděleno.";
  });

  if (!permissionGranted) {
    for (const id of [
      "read",
      "write",
      "read-back",
      "replace",
      "delete",
      "remember-handle",
      "conflict",
    ] as StorageDiagnosticId[]) {
      reportBlocked(id, reporter, "Nelze ověřit bez oprávnění pro čtení a zápis.");
    }
    return;
  }

  await reportStep("read", reporter, async () => {
    let count = 0;
    for await (const entry of directory.values()) {
      if (entry.kind === "file" || entry.kind === "directory") count += 1;
    }
    return `Adresář byl přečten; nalezeno položek: ${count}.`;
  });

  const runId = crypto.randomUUID();
  const testName = `.onkoflow-diagnostic-${runId}.json`;
  const conflictName = `.onkoflow-conflict-${runId}.json`;
  const firstContent = JSON.stringify({ test: "OnkoFlow", revision: 1 });
  const replacementContent = JSON.stringify({ test: "OnkoFlow", revision: 2 });
  let testHandle: FileSystemFileHandle | null = null;

  const writePassed = await reportStep("write", reporter, async () => {
    testHandle = await directory.getFileHandle(testName, { create: true });
    await writeText(testHandle, firstContent);
    return `Soubor ${testName} byl vytvořen a uzavřen.`;
  });

  if (writePassed && testHandle) {
    await reportStep("read-back", reporter, async () => {
      const content = await readText(testHandle as FileSystemFileHandle);
      if (content !== firstContent) throw new Error("Přečtený obsah neodpovídá zápisu.");
      return "Přečtený obsah přesně odpovídá prvnímu zápisu.";
    });

    await reportStep("replace", reporter, async () => {
      await writeText(testHandle as FileSystemFileHandle, replacementContent);
      const content = await readText(testHandle as FileSystemFileHandle);
      if (content !== replacementContent) {
        throw new Error("Obsah po nahrazení neodpovídá očekávané hodnotě.");
      }
      return "Obsah byl změněn, stream uzavřen a nová hodnota ověřena.";
    });
  } else {
    reportBlocked("read-back", reporter, "Předchozí vytvoření souboru selhalo.");
    reportBlocked("replace", reporter, "Předchozí vytvoření souboru selhalo.");
  }

  if (testHandle) {
    await reportStep("delete", reporter, async () => {
      await directory.removeEntry(testName);
      try {
        await directory.getFileHandle(testName);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          testHandle = null;
          return "Testovací soubor byl smazán a jeho nepřítomnost byla ověřena.";
        }
        throw error;
      }
      throw new Error("Soubor je po operaci smazání stále dostupný.");
    });
  } else {
    reportBlocked("delete", reporter, "Testovací soubor nebyl vytvořen.");
  }

  await reportStep("remember-handle", reporter, async () => {
    await saveDataDirectoryHandle(directory);
    const restored = await loadDataDirectoryHandle();
    if (!restored || !(await restored.isSameEntry(directory))) {
      throw new Error("Uložený directory handle se nepodařilo obnovit.");
    }
    return "IndexedDB obsahuje pouze obnovitelný directory handle; žádná klinická data.";
  });

  let conflictHandleCreated = false;
  await reportStep("conflict", reporter, async () => {
    const conflictHandle = await directory.getFileHandle(conflictName, { create: true });
    conflictHandleCreated = true;
    await writeText(
      conflictHandle,
      JSON.stringify({ schemaVersion: 1, revision: 12, writer: "initial" }, null, 2),
    );

    const workstationARevision = 12;
    const workstationBRevision = 12;
    await saveRevision(conflictHandle, workstationBRevision, 13, "workstation-b");

    let conflictDetected = false;
    try {
      await saveRevision(conflictHandle, workstationARevision, 13, "workstation-a");
    } catch (error) {
      if (
        error instanceof RevisionConflictError &&
        error.expectedRevision === 12 &&
        error.actualRevision === 13
      ) {
        conflictDetected = true;
      } else {
        throw error;
      }
    }

    if (!conflictDetected) throw new Error("Zastaralý zápis nebyl odmítnut.");

    await directory.removeEntry(conflictName);
    conflictHandleCreated = false;
    return "Zastaralý zápis revize 12 byl po změně na revizi 13 správně odmítnut. Jde o sekvenční simulaci, nikoli důkaz atomického souběhu SMB.";
  });

  const cleanupTargets: Array<{
    name: string;
    id: Extract<StorageDiagnosticId, "delete" | "conflict">;
  }> = [];
  if (testHandle) cleanupTargets.push({ name: testName, id: "delete" });
  if (conflictHandleCreated) {
    cleanupTargets.push({ name: conflictName, id: "conflict" });
  }

  for (const { name, id } of cleanupTargets) {
    try {
      await directory.removeEntry(name);
    } catch (error) {
      reporter({
        id,
        label: diagnosticLabels[id],
        status: "failed",
        detail: `Dočasný soubor ${name} se nepodařilo uklidit: ${explainError(error)}`,
      });
    }
  }
}
