"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildInfo, isDepartmentMode } from "@/lib/build-info";
import {
  forgetDataDirectoryHandle,
  loadDataDirectoryHandle,
  saveDataDirectoryHandle,
} from "@/lib/storage/directory-handle-store";
import {
  createInitialDiagnostics,
  getStorageCapability,
  pickDataDirectory,
  queryReadWritePermission,
  requestReadWritePermission,
  runStorageDiagnostics,
  type StorageCapability,
  type StorageDiagnosticResult,
} from "@/lib/storage/file-system-access";

type ConnectionState =
  | "checking"
  | "unsupported"
  | "disconnected"
  | "needs-permission"
  | "connected"
  | "error";

function describeError(error: unknown) {
  if (error instanceof DOMException) {
    return `${error.name}: ${error.message || "Operace byla odmítnuta prohlížečem."}`;
  }
  if (error instanceof Error) return error.message;
  return "Neznámá chyba.";
}

function DiagnosticIcon({ status }: { status: StorageDiagnosticResult["status"] }) {
  if (status === "passed") return <CheckCircle2 size={19} aria-hidden="true" />;
  if (status === "failed") return <XCircle size={19} aria-hidden="true" />;
  if (status === "running") return <LoaderCircle className="spin" size={19} aria-hidden="true" />;
  if (status === "blocked") return <AlertTriangle size={19} aria-hidden="true" />;
  return <CircleDashed size={19} aria-hidden="true" />;
}

export function StorageDiagnostics() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [capability, setCapability] = useState<StorageCapability | null>(null);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [diagnostics, setDiagnostics] = useState(createInitialDiagnostics);
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const updateDiagnostic = useCallback((result: StorageDiagnosticResult) => {
    setDiagnostics((current) =>
      current.map((item) => (item.id === result.id ? result : item)),
    );
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreDirectory() {
      const detected = getStorageCapability();
      if (!active) return;
      setCapability(detected);
      updateDiagnostic({
        id: "application",
        label: "Statická aplikace",
        status: isDepartmentMode ? "passed" : "blocked",
        detail: isDepartmentMode
          ? `Department static export je načten; protokol ${detected.protocol}`
          : "Běží produkční webový build; statický departmental export se zde neověřuje.",
      });
      updateDiagnostic({
        id: "secure-context",
        label: "Bezpečný kontext",
        status: detected.isSecureContext ? "passed" : "failed",
        detail: `window.isSecureContext = ${String(detected.isSecureContext)}`,
      });
      updateDiagnostic({
        id: "file-system-api",
        label: "File System Access API",
        status: detected.hasDirectoryPicker ? "passed" : "failed",
        detail: detected.hasDirectoryPicker
          ? "window.showDirectoryPicker je dostupný."
          : "window.showDirectoryPicker není dostupný.",
      });

      if (!detected.isSecureContext || !detected.hasDirectoryPicker) {
        setConnectionState("unsupported");
        return;
      }

      try {
        const restored = await loadDataDirectoryHandle();
        if (!active) return;
        if (!restored) {
          setConnectionState("disconnected");
          return;
        }

        setDirectory(restored);
        const permission = await queryReadWritePermission(restored);
        if (!active) return;
        setConnectionState(permission === "granted" ? "connected" : "needs-permission");
      } catch (error) {
        if (!active) return;
        setMessage(`Directory handle nelze obnovit: ${describeError(error)}`);
        setConnectionState("disconnected");
      }
    }

    void restoreDirectory();
    return () => {
      active = false;
    };
  }, [updateDiagnostic]);

  const passedCount = diagnostics.filter((item) => item.status === "passed").length;
  const failedCount = diagnostics.filter(
    (item) => item.status === "failed" || item.status === "blocked",
  ).length;
  const completed = diagnostics.every((item) => item.status === "passed");
  const buildDate = useMemo(() => {
    if (buildInfo.builtAt === "development") return "development";
    const date = new Date(buildInfo.builtAt);
    return Number.isNaN(date.getTime())
      ? buildInfo.builtAt
      : new Intl.DateTimeFormat("cs-CZ", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }, []);

  const connectDirectory = async () => {
    setMessage("");
    try {
      const selected = await pickDataDirectory();
      setDirectory(selected);
      setDiagnostics(createInitialDiagnostics());
      const permission = await queryReadWritePermission(selected);
      setConnectionState(permission === "granted" ? "connected" : "needs-permission");

      try {
        await saveDataDirectoryHandle(selected);
      } catch (error) {
        setMessage(
          `Složka je připojena pro tuto relaci, ale handle nelze zapamatovat: ${describeError(error)}`,
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage(
          "Výběr složky byl zrušen nebo jej prohlížeč odmítl. Pokud jste klikli na Vybrat složku, Edge nepředal aplikaci directory handle; nejde o chybu zadané cesty.",
        );
        return;
      }
      setMessage(`Složku se nepodařilo připojit: ${describeError(error)}`);
      setConnectionState("error");
    }
  };

  const allowDirectory = async () => {
    if (!directory) return;
    setMessage("");
    try {
      const permission = await requestReadWritePermission(directory);
      setConnectionState(permission === "granted" ? "connected" : "needs-permission");
      if (permission !== "granted") {
        setMessage("Přístup pro čtení a zápis nebyl udělen.");
      }
    } catch (error) {
      setMessage(`Oprávnění nelze získat: ${describeError(error)}`);
      setConnectionState("needs-permission");
    }
  };

  const runDiagnostics = async () => {
    if (!directory || isRunning) return;
    setMessage("");
    setDiagnostics(createInitialDiagnostics());
    setIsRunning(true);
    try {
      await runStorageDiagnostics(directory, updateDiagnostic, {
        staticExport: isDepartmentMode,
      });
    } catch (error) {
      setMessage(`Diagnostika byla neočekávaně přerušena: ${describeError(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const forgetDirectory = async () => {
    setMessage("");
    try {
      await forgetDataDirectoryHandle();
      setDirectory(null);
      setDiagnostics(createInitialDiagnostics());
      setConnectionState("disconnected");
    } catch (error) {
      setMessage(`Uložený handle nelze odstranit: ${describeError(error)}`);
    }
  };

  return (
    <>
      <div className="page-heading storage-page-heading">
        <div>
          <p className="eyebrow">Provozní datová složka</p>
          <h1>Diagnostika datového úložiště</h1>
          <p>
            Ověření čtení, zápisu, nahrazení souboru, oprávnění a detekce konfliktu revizí.
          </p>
        </div>
        <span className="storage-mode-chip department">
          {isDepartmentMode ? "OFFLINE PROVOZ" : "PRODUKČNÍ PROVOZ"}
        </span>
      </div>

      <section className="panel storage-build-panel">
        <div className="storage-build-icon">
          <Database size={22} aria-hidden="true" />
        </div>
        <dl>
          <div>
            <dt>Aplikace</dt>
            <dd>{buildInfo.application} {buildInfo.version}</dd>
          </div>
          <div>
            <dt>Datové schéma</dt>
            <dd>{buildInfo.schemaVersion}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>{buildInfo.commit}</dd>
          </div>
          <div>
            <dt>Build</dt>
            <dd>{buildDate}</dd>
          </div>
        </dl>
      </section>

      <section className="storage-layout">
        <div className="panel storage-connection-panel">
          <div className="panel-header">
            <div>
              <h2>Připojení datové složky</h2>
              <p>
                Vyberte výhradně složku <code>OnkoFlow\data</code>.
                Aplikace nejprve požádá o čtení a zápis povolíte samostatně.
              </p>
            </div>
            <span className={`connection-state state-${connectionState}`}>
              {connectionState === "checking" && "Kontrola…"}
              {connectionState === "unsupported" && "Nepodporováno"}
              {connectionState === "disconnected" && "Nepřipojeno"}
              {connectionState === "needs-permission" && "Vyžaduje oprávnění"}
              {connectionState === "connected" && "Připojeno"}
              {connectionState === "error" && "Chyba"}
            </span>
          </div>

          {connectionState === "unsupported" ? (
            <div className="storage-alert danger" role="alert">
              <ShieldAlert size={21} aria-hidden="true" />
              <div>
                <strong>Tento prohlížeč nebo způsob otevření není podporován</strong>
                <span>
                  Použijte aktuální Microsoft Edge. Bez bezpečného kontextu a
                  `showDirectoryPicker` nelze pokračovat.
                </span>
              </div>
            </div>
          ) : null}

          <div className="storage-capabilities" aria-label="Schopnosti prohlížeče">
            <div>
              <span>Protokol</span>
              <strong>{capability?.protocol ?? "Kontrola…"}</strong>
            </div>
            <div>
              <span>Bezpečný kontext</span>
              <strong>{capability ? (capability.isSecureContext ? "ANO" : "NE") : "—"}</strong>
            </div>
            <div>
              <span>Directory picker</span>
              <strong>{capability ? (capability.hasDirectoryPicker ? "ANO" : "NE") : "—"}</strong>
            </div>
            <div>
              <span>IndexedDB</span>
              <strong>{capability ? (capability.hasIndexedDb ? "ANO" : "NE") : "—"}</strong>
            </div>
          </div>

          <div className="selected-directory">
            <FolderOpen size={21} aria-hidden="true" />
            <div>
              <span>Vybraný adresář</span>
              <strong>{directory?.name ?? "Žádný"}</strong>
              <small>Úplnou lokální/UNC cestu prohlížeč záměrně aplikaci nesděluje.</small>
            </div>
          </div>

          {message ? (
            <div className="storage-alert warning" role="alert">
              <AlertTriangle size={19} aria-hidden="true" />
              <span>{message}</span>
            </div>
          ) : null}

          <div className="storage-actions">
            {connectionState === "needs-permission" ? (
              <button className="button button-primary" type="button" onClick={allowDirectory}>
                <ShieldAlert size={17} aria-hidden="true" />
                Povolit přístup
              </button>
            ) : (
              <button
                className="button button-primary"
                type="button"
                onClick={connectDirectory}
                disabled={connectionState === "checking" || connectionState === "unsupported"}
              >
                <FolderOpen size={17} aria-hidden="true" />
                {directory ? "Vybrat jinou složku" : "Připojit datovou složku"}
              </button>
            )}
            {directory ? (
              <button className="button button-secondary" type="button" onClick={forgetDirectory}>
                <Trash2 size={16} aria-hidden="true" />
                Zapomenout složku
              </button>
            ) : null}
          </div>
        </div>

        <aside className="panel storage-safety-panel">
          <ShieldAlert size={23} aria-hidden="true" />
          <div>
            <h2>Co test udělá</h2>
            <p>
              Ve vybraném adresáři vytvoří dva náhodně pojmenované diagnostické JSON
              soubory, ověří jejich obsah a následně je smaže.
            </p>
            <p>
              Nevkládejte skutečná pacientská data. Úspěch tohoto testu ještě nepotvrzuje
              bezpečný souběžný provoz na více počítačích.
            </p>
          </div>
        </aside>
      </section>

      <section className="panel diagnostics-panel">
        <div className="panel-header diagnostics-header">
          <div>
            <h2>Výsledky Storage Diagnostics</h2>
            <p>Každý stav je založený na skutečně dokončené operaci.</p>
          </div>
          <div className="diagnostics-summary" aria-live="polite">
            <span className="passed">OK {passedCount}</span>
            <span className={failedCount ? "failed" : ""}>Chyby {failedCount}</span>
          </div>
        </div>

        <div className="diagnostic-list">
          {diagnostics.map((item) => (
            <div className={`diagnostic-row diagnostic-${item.status}`} key={item.id}>
              <span className="diagnostic-icon">
                <DiagnosticIcon status={item.status} />
              </span>
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              <small>{item.durationMs === undefined ? "—" : `${item.durationMs} ms`}</small>
            </div>
          ))}
        </div>

        {completed ? (
          <div className="storage-alert success" role="status">
            <CheckCircle2 size={21} aria-hidden="true" />
            <div>
              <strong>Základní test na tomto počítači prošel</strong>
              <span>
                Před migrací klinických dat je ještě nutný kontrolovaný test ze dvou
                pracovních stanic a volba bezpečného verzovaného zápisu.
              </span>
            </div>
          </div>
        ) : null}

        <div className="diagnostics-run-row">
          <button
            className="button button-primary"
            type="button"
            onClick={runDiagnostics}
            disabled={connectionState !== "connected" || isRunning}
          >
            <RefreshCw className={isRunning ? "spin" : ""} size={17} aria-hidden="true" />
            {isRunning ? "Probíhá diagnostika…" : "Spustit úplný test"}
          </button>
          <span>Spouštějte pouze v prázdné testovací datové složce.</span>
        </div>
      </section>
    </>
  );
}
