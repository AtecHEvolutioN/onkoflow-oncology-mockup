"use client";

import {
  AlertTriangle,
  FolderOpen,
  HeartPulse,
  KeyRound,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  loadDataDirectoryHandle,
  saveDataDirectoryHandle,
} from "@/lib/storage/directory-handle-store";
import {
  getStorageCapability,
  pickDataDirectory,
  queryReadWritePermission,
  requestReadWritePermission,
} from "@/lib/storage/file-system-access";

const ACCESS_PASSWORD_SHA256 =
  "abcbbbb17cbb3464ad5edd16c79103f84b151616b3bb9c011422d8591d114b4a";

export type OnkoFlowSession = {
  userName: string;
  directoryName: string;
  directory: FileSystemDirectoryHandle;
};

function describeError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError"
      ? "Výběr složky byl zrušen."
      : `${error.name}: ${error.message || "Operace byla odmítnuta prohlížečem."}`;
  }
  if (error instanceof Error) return error.message;
  return "Neznámá chyba.";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function LoginScreen({
  onLogin,
}: {
  onLogin: (session: OnkoFlowSession) => void;
}) {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [permission, setPermission] = useState<PermissionState | "unknown">("unknown");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreDirectory() {
      const capability = getStorageCapability();
      if (!capability.isSecureContext || !capability.hasDirectoryPicker) {
        if (active) {
          setError(
            "Tento způsob otevření nepodporuje bezpečný výběr složky. Použijte nainstalovanou aplikaci OnkoFlow v Microsoft Edge.",
          );
          setIsChecking(false);
        }
        return;
      }

      try {
        const restored = await loadDataDirectoryHandle();
        if (!active || !restored) return;
        setDirectory(restored);
        setPermission(await queryReadWritePermission(restored));
      } catch (restoreError) {
        if (active) setError(`Uloženou složku nelze obnovit: ${describeError(restoreError)}`);
      } finally {
        if (active) setIsChecking(false);
      }
    }

    void restoreDirectory();
    return () => {
      active = false;
    };
  }, []);

  const selectDirectory = async () => {
    setError("");
    try {
      const selected = await pickDataDirectory();
      if (selected.name.toLocaleLowerCase("cs-CZ") !== "data") {
        setDirectory(null);
        setPermission("unknown");
        setError("Vyberte přímo složku OnkoFlow\\data, nikoli složku OnkoFlow nebo app.");
        return;
      }

      setDirectory(selected);
      setPermission(await queryReadWritePermission(selected));
      await saveDataDirectoryHandle(selected);
    } catch (selectionError) {
      setError(describeError(selectionError));
    } finally {
      setIsChecking(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!userName.trim()) {
      setError("Vyplňte své jméno nebo služební identifikátor.");
      return;
    }
    if (!directory) {
      setError("Nejprve vyberte datovou složku OnkoFlow\\data.");
      return;
    }

    setIsSubmitting(true);
    try {
      if ((await sha256(password)) !== ACCESS_PASSWORD_SHA256) {
        setError("Nesprávné heslo.");
        return;
      }

      const currentPermission = await queryReadWritePermission(directory);
      const grantedPermission =
        currentPermission === "granted"
          ? currentPermission
          : await requestReadWritePermission(directory);
      setPermission(grantedPermission);

      if (grantedPermission !== "granted") {
        setError("Pro pokračování je nutné povolit přístup ke čtení a zápisu.");
        return;
      }

      await saveDataDirectoryHandle(directory);
      onLogin({
        userName: userName.trim(),
        directoryName: directory.name,
        directory,
      });
    } catch (submitError) {
      setError(`Přihlášení se nezdařilo: ${describeError(submitError)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">
            <HeartPulse size={27} />
          </span>
          <div>
            <strong>OnkoFlow</strong>
            <span>Registr onkologické péče</span>
          </div>
        </div>

        <div className="login-heading">
          <p className="eyebrow">Přístup do aplikace</p>
          <h1 id="login-title">Přihlášení</h1>
          <p>Identifikujte se a připojte datovou složku oddělení.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="form-field login-field">
            <span>Uživatel</span>
            <div className="login-input-wrap">
              <UserRound size={18} aria-hidden="true" />
              <input
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="Jméno a příjmení / služební ID"
                autoComplete="username"
                autoFocus
              />
            </div>
            <small>
              Prohlížeč nemá přístup k přihlášenému Windows účtu; identifikaci je nutné zadat.
            </small>
          </label>

          <label className="form-field login-field">
            <span>Heslo</span>
            <div className="login-input-wrap">
              <KeyRound size={18} aria-hidden="true" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </label>

          <div className="login-directory">
            <div className="login-directory-status">
              {isChecking ? (
                <LoaderCircle className="spin" size={20} aria-hidden="true" />
              ) : (
                <FolderOpen size={20} aria-hidden="true" />
              )}
              <div>
                <span>Datová složka</span>
                <strong>{directory?.name ?? "Není vybrána"}</strong>
                {directory ? (
                  <small>
                    Přístup: {permission === "granted" ? "čtení a zápis povolen" : "bude vyžádán při přihlášení"}
                  </small>
                ) : null}
              </div>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={selectDirectory}
              disabled={isChecking}
            >
              <FolderOpen size={17} aria-hidden="true" />
              {directory ? "Změnit složku" : "Vybrat složku"}
            </button>
          </div>

          {error ? (
            <div className="login-alert" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            className="button button-primary login-submit"
            type="submit"
            disabled={isSubmitting || isChecking}
          >
            {isSubmitting ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <LogIn size={18} aria-hidden="true" />
            )}
            {isSubmitting ? "Ověřování…" : "Přihlásit se"}
          </button>
        </form>

        <div className="login-security-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            <strong>Pilotní přístupová vrstva.</strong> Heslo se neukládá. Skutečné produkční
            ověřování musí zajistit nemocniční identita nebo serverové SSO.
          </p>
        </div>
      </section>
    </main>
  );
}
