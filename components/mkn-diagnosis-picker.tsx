"use client";

import { BookOpenText, Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

export type MknDiagnosis = {
  code: string;
  label: string;
  chapter: string;
  group: string;
  terminal: boolean;
};

type MknCatalogue = {
  version: string;
  validFrom: string;
  source: string;
  count: number;
  diagnoses: MknDiagnosis[];
};

const FEATURED_CODES = ["C53", "C53.1", "C54", "C54.1", "C55", "C56", "C57", "D06"];
let cataloguePromise: Promise<MknCatalogue> | null = null;
let catalogueSearchIndex: Array<{
  diagnosis: MknDiagnosis;
  normalizedCode: string;
  normalizedLabel: string;
}> = [];

function loadCatalogue() {
  cataloguePromise ??= fetch("/data/mkn-10-cz-2026.json").then(async (response) => {
    if (!response.ok) throw new Error(`MKN katalog nelze načíst (${response.status}).`);
    const catalogue = (await response.json()) as MknCatalogue;
    catalogueSearchIndex = catalogue.diagnoses.map((diagnosis) => ({
      diagnosis,
      normalizedCode: diagnosis.code.toLocaleLowerCase("cs-CZ").replace(".", ""),
      normalizedLabel: normalizeForSearch(diagnosis.label),
    }));
    return catalogue;
  });
  return cataloguePromise;
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .toLocaleLowerCase("cs-CZ")
    .trim();
}

export function MknDiagnosisPicker({
  label,
  value,
  onChange,
  excludeCodes = [],
  variant = "primary",
}: {
  label: string;
  value: MknDiagnosis | null;
  onChange: (diagnosis: MknDiagnosis) => void;
  excludeCodes?: string[];
  variant?: "primary" | "secondary";
}) {
  const [catalogue, setCatalogue] = useState<MknCatalogue | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [isOpen]);

  const filteredDiagnoses = useMemo(() => {
    if (!catalogue) return [];
    const excluded = new Set(excludeCodes);
    const normalizedQuery = normalizeForSearch(deferredQuery);
    const codeQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");

    if (!normalizedQuery) {
      return FEATURED_CODES.flatMap((code) => {
        const diagnosis = catalogue.diagnoses.find(
          (item) => item.code === code && !excluded.has(item.code),
        );
        return diagnosis ? [diagnosis] : [];
      });
    }

    return catalogueSearchIndex
      .filter(({ diagnosis }) => !excluded.has(diagnosis.code))
      .map(({ diagnosis, normalizedCode, normalizedLabel }) => {
        let score = Number.POSITIVE_INFINITY;
        if (normalizedCode === codeQuery) score = 0;
        else if (normalizedCode.startsWith(codeQuery)) score = 1;
        else if (normalizedLabel.startsWith(normalizedQuery)) score = 2;
        else if (normalizedLabel.includes(normalizedQuery)) score = 3;
        return { diagnosis, score };
      })
      .filter((result) => Number.isFinite(result.score))
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.diagnosis.code.localeCompare(right.diagnosis.code, "cs-CZ"),
      )
      .map((result) => result.diagnosis);
  }, [catalogue, deferredQuery, excludeCodes]);

  const visibleDiagnoses = filteredDiagnoses.slice(0, 80);

  const togglePicker = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen || catalogue || isLoading) return;

    setIsLoading(true);
    setError("");
    void loadCatalogue()
      .then(setCatalogue)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "MKN katalog nelze načíst.");
        cataloguePromise = null;
      })
      .finally(() => setIsLoading(false));
  };

  return (
    <div
      className={`mkn-picker mkn-picker-${variant}`}
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
        }
      }}
    >
      <span className="mkn-picker-label">{label}</span>
      <button
        className={`mkn-picker-trigger ${value ? "has-value" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={togglePicker}
      >
        <span className="mkn-picker-icon" aria-hidden="true">
          <BookOpenText size={19} />
        </span>
        <span className="mkn-picker-value">
          {value ? (
            <>
              <strong>{value.code}</strong>
              <span>{value.label}</span>
            </>
          ) : (
            <>
              <strong>Vybrat diagnózu</strong>
              <span>Hledejte podle kódu nebo názvu</span>
            </>
          )}
        </span>
        <ChevronDown className={isOpen ? "is-open" : ""} size={19} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="mkn-picker-popover">
          <div className="mkn-search-wrap">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              role="combobox"
              aria-controls="mkn-diagnosis-results"
              aria-expanded="true"
              aria-autocomplete="list"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Např. C54.1, endometrium, diabetes…"
            />
            {query ? (
              <button type="button" aria-label="Vymazat hledání" onClick={() => setQuery("")}>
                <X size={17} />
              </button>
            ) : null}
          </div>

          <div className="mkn-catalogue-meta">
            <span>{query ? "Výsledky hledání" : "Časté onkogynekologické diagnózy"}</span>
            <strong>{catalogue ? `${catalogue.version} · ${catalogue.count.toLocaleString("cs-CZ")} položek` : "Oficiální katalog ÚZIS"}</strong>
          </div>

          {isLoading ? (
            <div className="mkn-picker-message">
              <LoaderCircle className="spin" size={20} /> Načítám úplný katalog…
            </div>
          ) : error ? (
            <div className="mkn-picker-message error" role="alert">{error}</div>
          ) : visibleDiagnoses.length ? (
            <div className="mkn-results" id="mkn-diagnosis-results" role="listbox">
              {visibleDiagnoses.map((diagnosis, index) => {
                const selected = diagnosis.code === value?.code && diagnosis.label === value.label;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={selected ? "selected" : ""}
                    key={`${diagnosis.code}-${diagnosis.label}-${index}`}
                    onClick={() => {
                      onChange(diagnosis);
                      setQuery("");
                      setIsOpen(false);
                    }}
                  >
                    <span className="mkn-result-code">{diagnosis.code}</span>
                    <span className="mkn-result-copy">
                      <strong>{diagnosis.label}</strong>
                      <small>Oddíl {diagnosis.group} · kapitola {diagnosis.chapter}</small>
                    </span>
                    {selected ? <Check size={18} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : catalogue ? (
            <div className="mkn-picker-message">Žádná diagnóza neodpovídá hledání.</div>
          ) : null}

          {filteredDiagnoses.length > visibleDiagnoses.length ? (
            <p className="mkn-results-note">
              Zobrazeno prvních {visibleDiagnoses.length} z {filteredDiagnoses.length.toLocaleString("cs-CZ")} výsledků. Upřesněte hledání.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
