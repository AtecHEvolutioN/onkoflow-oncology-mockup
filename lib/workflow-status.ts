import type { Patient, StagingExamination } from "./registry-model";

function compareDate(date: string, today: string) {
  return date < today ? -1 : date > today ? 1 : 0;
}

export function getBiopsyDisplayStatus(patient: Patient, today: string) {
  const date = patient.biopsyResult?.date;
  const result = patient.biopsyResult?.conclusion.trim();
  if (result) return "Výsledek biopsie k dispozici";
  if (!date) return "Biopsie nenaplánována";
  const comparison = compareDate(date, today);
  if (comparison > 0) return "Čekání na termín biopsie";
  if (comparison === 0) return "Dnes biopsie";
  return "Čekání na výsledek biopsie";
}

export function getExaminationDisplayStatus(
  examination: StagingExamination,
  today: string,
) {
  if (examination.result.trim()) return "Dokončeno";
  if (!examination.date) return "Nenaplánováno";
  const comparison = compareDate(examination.date, today);
  if (comparison > 0) return "Čekání na termín";
  if (comparison === 0) return "Vyšetření dnes";
  return "Čekání na výsledek";
}

export function getStagingDisplayStatus(patient: Patient, today: string) {
  const examinations = patient.stagingDetails ?? [];
  if (!examinations.length) return "Vyšetření nejsou vybrána";
  const completed = examinations.filter((item) => item.result.trim()).length;
  if (completed === examinations.length) {
    return `Výsledky kompletní (${completed}/${examinations.length})`;
  }
  if (examinations.some((item) => getExaminationDisplayStatus(item, today) === "Vyšetření dnes")) {
    return "Vyšetření dnes";
  }
  if (examinations.some((item) => getExaminationDisplayStatus(item, today) === "Čekání na výsledek")) {
    return "Čekání na výsledek";
  }
  return "Čekání na termín";
}

export function getMdtDisplayStatus(patient: Patient, today: string) {
  if (patient.mdtConclusion?.trim()) return "MDT dokončeno";
  if (!patient.mdtDate) return "MDT nenaplánováno";
  const comparison = compareDate(patient.mdtDate, today);
  if (comparison > 0) return "Čekání na MDT";
  if (comparison === 0) return "MDT dnes";
  return "Čekání na závěr MDT";
}
