"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock3,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  HardDrive,
  History,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Microscope,
  PencilLine,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StorageDiagnostics } from "@/components/storage-diagnostics";
import { LoginScreen, type OnkoFlowSession } from "@/components/login-screen";
import {
  BiopsyStatus,
  CareTask,
  CarePhase,
  EventKind,
  MdtDetails,
  Patient,
  StagingExamination,
  TimelineEvent,
  TreatmentRoute,
  diagnoses,
  corePathwaySteps,
  processSummarySteps,
  standardStagingExaminations,
  treatmentRoutes,
} from "@/lib/registry-model";
import {
  createPatientRecord,
  explainRepositoryError,
  loadRegistry,
  updatePatientRecord,
  type RepositoryAuditEvent,
} from "@/lib/storage/patient-repository";
import {
  advancePatientThroughWorkflow,
  getWorkflowAdvanceAction,
} from "@/lib/workflow";
import type { CompletedBiopsyStatus, WorkflowAdvanceInput } from "@/lib/workflow";
import {
  getBiopsyDisplayStatus as getBiopsyStatus,
  getExaminationDisplayStatus,
  getMdtDisplayStatus as getMdtStatus,
  getStagingDisplayStatus as getStagingStatus,
} from "@/lib/workflow-status";

type View = "dashboard" | "patients" | "patient" | "tasks" | "audit" | "storage";

type PatientPhaseFilter = {
  label: string;
  phases: CarePhase[];
  treatmentRoutes?: TreatmentRoute[];
};

type BirthNumberResult = {
  date: string;
  checksumValid: boolean | null;
  error: string;
};

type MajorStage = "Příjem" | "Biopsie" | "Staging" | "MDT" | "Terapie";

const SESSION_ACTOR = "Uživatel oddělení";

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

const navItems: Array<{
  id: Exclude<View, "patient">;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard },
  { id: "patients", label: "Pacienti", icon: Users },
  { id: "tasks", label: "Úkoly a termíny", icon: ListChecks },
  { id: "storage", label: "Datové úložiště", icon: HardDrive },
  { id: "audit", label: "Auditní stopa", icon: History },
];

const eventIcons: Record<EventKind, typeof ClipboardList> = {
  intake: FilePlus2,
  pathology: Microscope,
  imaging: ScanLine,
  mdt: UsersRound,
  surgery: Stethoscope,
  systemic: Activity,
  followup: CalendarDays,
  recurrence: History,
};

const eventKindLabels: Record<EventKind, string> = {
  intake: "Přijetí do péče",
  pathology: "Patologie",
  imaging: "Zobrazovací vyšetření",
  mdt: "Multidisciplinární tým",
  surgery: "Operační léčba",
  systemic: "Systémová léčba",
  followup: "Kontrola",
  recurrence: "Recidiva",
};

function formatDate(value: string, includeYear = true) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function formatLongDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function createNextStepTask(patient: Patient): CareTask {
  return {
    id: `task-next-${patient.id}-${patient.nextStepDate}`,
    patientId: patient.id,
    patient: `${patient.firstName} ${patient.lastName}`,
    title: patient.nextStep,
    date: patient.nextStepDate,
    time: "—",
    status: "Naplánováno",
    priority: patient.priority,
  };
}

function createTaskFromEvent(patient: Patient, event: TimelineEvent): CareTask {
  return {
    id: `task-${event.id}`,
    patientId: patient.id,
    patient: `${patient.firstName} ${patient.lastName}`,
    title: event.title,
    date: event.date,
    time: event.time || "—",
    status: event.status,
    priority: patient.priority,
  };
}

function calculateAge(value: string) {
  const birth = new Date(`${value}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function deriveTasks(patients: Patient[]) {
  return patients.flatMap((patient) => {
    const eventTasks = patient.events
      .filter((event) => event.status !== "Dokončeno")
      .map((event) => createTaskFromEvent(patient, event));
    const hasMatchingEvent = eventTasks.some(
      (task) => task.title === patient.nextStep && task.date === patient.nextStepDate,
    );
    return hasMatchingEvent ? eventTasks : [createNextStepTask(patient), ...eventTasks];
  });
}

type DashboardActionTone = "critical" | "warning" | "today" | "ready" | "scheduled";

type DashboardFilter =
  | "all"
  | "action"
  | "overdue"
  | "mdt-today"
  | "waiting-result"
  | "Biopsie"
  | "Staging"
  | "MDT"
  | "Terapie";

type DashboardAction = {
  id: string;
  patientId: string;
  patientName: string;
  diagnosis: string;
  stage: MajorStage | "Recidiva";
  title: string;
  timing: string;
  date: string;
  tone: DashboardActionTone;
};

const DASHBOARD_TONE_PRIORITY: Record<DashboardActionTone, number> = {
  critical: 0,
  today: 1,
  warning: 2,
  ready: 3,
  scheduled: 4,
};

function calendarDayDifference(date: string, today: string) {
  if (!date) return null;
  const target = Date.parse(`${date}T12:00:00Z`);
  const origin = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(origin)) return null;
  return Math.round((target - origin) / 86_400_000);
}

function getDashboardActionSortRank(action: DashboardAction, today: string) {
  const dateDifference = action.date ? calendarDayDifference(action.date, today) : null;
  if (dateDifference !== null && dateDifference < 0) return 0;
  if (dateDifference === 0 || action.tone === "today") return 1;
  if (!action.date) return 2;
  return 3;
}

function patientMatchesDashboardFilter(
  patient: Patient,
  action: DashboardAction | undefined,
  filter: DashboardFilter,
  today: string,
) {
  if (filter === "all") return true;
  if (filter === "action") return Boolean(action && action.tone !== "scheduled");
  if (filter === "overdue") {
    return Boolean(action?.timing.toLocaleLowerCase("cs-CZ").startsWith("po termínu"));
  }
  if (filter === "mdt-today") return patient.mdtDate === today;
  if (filter === "waiting-result") {
    const title = action?.title.toLocaleLowerCase("cs-CZ") ?? "";
    return title.includes("čeká na výsledek") || title.includes("čeká na závěr");
  }
  if (filter === "Biopsie") {
    return patient.phase === "Biopsie" || patient.phase === "Čekání na výsledek biopsie";
  }
  if (filter === "Staging") {
    return patient.phase === "Staging" || patient.phase === "Čekání na výsledky stagingu";
  }
  if (filter === "MDT") return patient.phase === "MDT";
  return getPatientMajorStageIndex(patient) === 4 && patient.phase !== "Recidiva";
}

function czechDayCount(days: number) {
  const absolute = Math.abs(days);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (absolute === 1) return "1 den";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${absolute} dny`;
  return `${absolute} dní`;
}

function czechPatientCount(count: number) {
  if (count === 1) return "1 pacientka";
  if (count >= 2 && count <= 4) return `${count} pacientky`;
  return `${count} pacientek`;
}

function czechAppointmentCount(count: number) {
  if (count === 1) return "1 termín";
  if (count >= 2 && count <= 4) return `${count} termíny`;
  return `${count} termínů`;
}

function relativeDateLabel(date: string, today: string) {
  const difference = calendarDayDifference(date, today);
  if (difference === null) return "Termín neurčen";
  if (difference === 0) return "DNES";
  if (difference === 1) return "zítra";
  if (difference > 1) return `za ${difference} dní`;
  return `po termínu ${czechDayCount(difference)}`;
}

function getPatientDashboardAction(patient: Patient, today: string): DashboardAction | null {
  const patientName = `${patient.lastName} ${patient.firstName}`;
  const makeAction = (
    stage: DashboardAction["stage"],
    title: string,
    date: string,
    tone: DashboardActionTone,
    timing = relativeDateLabel(date, today),
  ) => ({
    id: `${patient.id}-${stage}-${title}`,
    patientId: patient.id,
    patientName,
    diagnosis: patient.primaryDiagnosisCode,
    stage,
    title,
    timing,
    date,
    tone,
  });

  if (patient.phase === "Příjem") {
    const difference = calendarDayDifference(patient.nextStepDate, today);
    return makeAction(
      "Příjem",
      "Dokončit příjem pacientky",
      patient.nextStepDate,
      difference !== null && difference < 0 ? "critical" : "warning",
    );
  }

  if (patient.phase === "Biopsie" || patient.phase === "Čekání na výsledek biopsie") {
    const biopsy = patient.biopsyResult;
    if (!biopsy?.date) return makeAction("Biopsie", "Biopsie nenaplánována", "", "warning");
    if (biopsy.conclusion.trim()) {
      return makeAction("Biopsie", "Výsledek k dispozici — pokračovat do stagingu", biopsy.date, "ready", "Výsledek doplněn");
    }
    const difference = calendarDayDifference(biopsy.date, today) ?? 0;
    if (difference > 0) return makeAction("Biopsie", "Naplánovaná biopsie", biopsy.date, "scheduled");
    if (difference === 0) return makeAction("Biopsie", "Biopsie dnes", biopsy.date, "today", "DNES");
    const waitingDays = Math.abs(difference);
    return makeAction(
      "Biopsie",
      "Čeká na výsledek histologie",
      biopsy.date,
      waitingDays > 7 ? "critical" : "warning",
      `čeká ${czechDayCount(waitingDays)}`,
    );
  }

  if (patient.phase === "Staging" || patient.phase === "Čekání na výsledky stagingu") {
    const examinations = getPatientStagingDetails(patient);
    if (!examinations.length) {
      return makeAction("Staging", "Vybrat stagingová vyšetření", "", "warning");
    }
    const pending = examinations
      .filter((item) => !item.result.trim())
      .map((item) => {
        if (!item.date) return makeAction("Staging", `${item.name}: termín neurčen`, "", "warning");
        const difference = calendarDayDifference(item.date, today) ?? 0;
        if (difference > 0) return makeAction("Staging", item.name, item.date, "scheduled");
        if (difference === 0) return makeAction("Staging", `${item.name}: vyšetření dnes`, item.date, "today", "DNES");
        const waitingDays = Math.abs(difference);
        return makeAction(
          "Staging",
          `${item.name}: čeká na výsledek`,
          item.date,
          waitingDays > 7 ? "critical" : "warning",
          `čeká ${czechDayCount(waitingDays)}`,
        );
      });
    if (!pending.length) {
      return makeAction("Staging", "Staging kompletní — naplánovat MDT", "", "ready", "Připraveno k MDT");
    }
    return pending.sort(
      (a, b) =>
        DASHBOARD_TONE_PRIORITY[a.tone] - DASHBOARD_TONE_PRIORITY[b.tone] ||
        a.date.localeCompare(b.date),
    )[0];
  }

  if (patient.phase === "MDT") {
    if (!patient.mdtDate) return makeAction("MDT", "Naplánovat MDT", "", "warning");
    if (patient.mdtConclusion?.trim()) {
      return makeAction("MDT", "Zvolit nebo potvrdit terapii", patient.mdtDate, "ready", "Závěr doplněn");
    }
    const difference = calendarDayDifference(patient.mdtDate, today) ?? 0;
    if (difference > 0) return makeAction("MDT", "Naplánované MDT", patient.mdtDate, difference === 1 ? "warning" : "scheduled");
    if (difference === 0) return makeAction("MDT", "MDT dnes", patient.mdtDate, "today", "DNES");
    const waitingDays = Math.abs(difference);
    return makeAction(
      "MDT",
      "Čeká na závěr MDT",
      patient.mdtDate,
      "critical",
      `čeká ${czechDayCount(waitingDays)}`,
    );
  }

  if (patient.phase === "Recidiva") {
    return makeAction("Recidiva", "Zahájit restaging recidivy", patient.nextStepDate, "critical");
  }

  if (
    patient.phase === "Terapie" ||
    patient.phase === "Primární operace" ||
    patient.phase === "Neoadjuvantní léčba" ||
    patient.phase === "Paliace"
  ) {
    const difference = calendarDayDifference(patient.nextStepDate, today);
    const tone = difference === null
      ? "warning"
      : difference < 0
        ? "critical"
        : difference === 0
          ? "today"
          : "scheduled";
    return makeAction("Terapie", patient.nextStep, patient.nextStepDate, tone);
  }

  return null;
}

function parseBirthNumber(value: string): BirthNumberResult {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return { date: "", checksumValid: null, error: "" };
  }

  if (digits.length !== 9 && digits.length !== 10) {
    return {
      date: "",
      checksumValid: null,
      error: "Rodné číslo musí obsahovat 9 nebo 10 číslic.",
    };
  }

  const yearPart = Number(digits.slice(0, 2));
  const encodedMonth = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  let month = encodedMonth;

  if (month > 70) month -= 70;
  else if (month > 50) month -= 50;
  else if (month > 20) month -= 20;

  const year = digits.length === 9 || yearPart >= 54 ? 1900 + yearPart : 2000 + yearPart;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const dateValid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;

  if (!dateValid) {
    return {
      date: "",
      checksumValid: null,
      error: "Zakódované datum není platné.",
    };
  }

  let checksumValid: boolean | null = null;
  if (digits.length === 10) {
    const fullNumber = BigInt(digits);
    checksumValid = fullNumber % 11n === 0n;

    if (!checksumValid && year < 1986 && digits.endsWith("0")) {
      const firstNine = BigInt(digits.slice(0, 9));
      checksumValid = firstNine % 11n === 10n;
    }
  }

  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, checksumValid, error: "" };
}

function formatBirthNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return value.trim();
  return `${digits.slice(0, 6)}/${digits.slice(6)}`;
}

const phaseStyleIndex: Record<CarePhase, number> = {
  Příjem: 1,
  Biopsie: 1,
  "Čekání na výsledek biopsie": 1,
  Staging: 2,
  "Čekání na výsledky stagingu": 2,
  MDT: 3,
  Terapie: 4,
  "Primární operace": 4,
  "Neoadjuvantní léčba": 4,
  Paliace: 4,
  Sledování: 5,
  Recidiva: 5,
};

function PhaseBadge({
  phase,
  treatmentRoute,
}: {
  phase: CarePhase;
  treatmentRoute?: TreatmentRoute | null;
}) {
  const waiting = phase.startsWith("Čekání");
  const label = phase === "Terapie" && treatmentRoute ? `Terapie · ${treatmentRoute}` : phase;
  return (
    <span
      className={`phase-badge phase-${phaseStyleIndex[phase]} ${
        waiting ? "phase-badge-waiting" : ""
      }`}
    >
      {label}
    </span>
  );
}

function getBiopsyDisplayStatus(patient: Patient) {
  return getBiopsyStatus(patient, todayIso());
}

function getStagingDisplayStatus(patient: Patient) {
  return getStagingStatus(patient, todayIso());
}

function getMdtDisplayStatus(patient: Patient) {
  return getMdtStatus(patient, todayIso());
}

function getPatientStagingDetails(patient: Patient): StagingExamination[] {
  if (patient.stagingDetails?.length) return patient.stagingDetails;
  return patient.stagingExaminations.map((name) => ({
    id: `legacy-${name}`,
    name,
    date: "",
    result: "",
  }));
}

function getInitialMdtDetails(patient: Patient): MdtDetails {
  return {
    surgeryPerformed: "",
    surgeryDate: "",
    surgeryDiagnosis: patient.primaryDiagnosisLabel,
    operator: "",
    histologyType: patient.biopsyResult?.conclusion ?? "",
    histologyNumber: patient.biopsyResult?.reportReference ?? "",
    histologyGrade: "",
    recommendedImaging: "",
    imagingIntervalMonths: "",
    imagingDate: "",
    imagingSite: "",
    checkupDate: "",
    oncologist: "",
    nationalOncologyRegistry: "",
    karnofsky: "",
    attendees: "",
    ...patient.mdtDetails,
  };
}

function getPatientMajorStageIndex(patient: Patient) {
  if (patient.phase === "Příjem") return 0;
  if (patient.phase === "Biopsie" || patient.phase === "Čekání na výsledek biopsie") return 1;
  if (patient.phase === "Staging" || patient.phase === "Čekání na výsledky stagingu") return 2;
  if (patient.phase === "MDT") return 3;
  return 4;
}

function PatientPathway({
  patient,
  onSelectStage,
  onAdvancePhase,
  advanceAction,
}: {
  patient: Patient;
  onSelectStage: (stage: MajorStage) => void;
  onAdvancePhase: () => void;
  advanceAction: ReturnType<typeof getWorkflowAdvanceAction>;
}) {
  const currentCoreIndex = getPatientMajorStageIndex(patient);
  const activeStage = corePathwaySteps[currentCoreIndex].phase;
  const stagingDetails = getPatientStagingDetails(patient);
  const activeStatus =
    activeStage === "Příjem"
      ? "Vstupní údaje jsou uloženy"
      : activeStage === "Biopsie"
        ? getBiopsyDisplayStatus(patient)
        : activeStage === "Staging"
          ? stagingDetails.length
            ? getStagingDisplayStatus(patient)
            : "Vyšetření nejsou vybrána"
          : activeStage === "MDT"
            ? getMdtDisplayStatus(patient)
            : patient.treatmentRoute ?? "Léčebná strategie není určena";
  const activeActionLabel =
    activeStage === "Příjem" && advanceAction
      ? advanceAction.label
      : activeStage === "Biopsie"
        ? "Otevřít / upravit biopsii"
        : activeStage === "Staging"
          ? stagingDetails.length
            ? "Otevřít / upravit staging"
            : "Vybrat stagingová vyšetření"
          : activeStage === "MDT"
            ? "Otevřít / upravit MDT"
            : "Zobrazit léčebnou strategii";

  return (
    <div className="clinical-pathway">
      <div className="pathway-steps">
        {corePathwaySteps.map((step, index) => {
          const completed = index < currentCoreIndex;
          const active = index === currentCoreIndex;
          let detail = step.detail;

          if (step.phase === "Příjem") detail = formatDate(patient.intakeDate);
          if (step.phase === "Biopsie") detail = getBiopsyDisplayStatus(patient);
          if (step.phase === "Staging") detail = getStagingDisplayStatus(patient);
          if (step.phase === "MDT") detail = getMdtDisplayStatus(patient);
          if (step.phase === "Terapie") detail = patient.treatmentRoute ?? "Větev zatím neurčena";

          return (
            <button
              type="button"
              className={`pathway-step ${completed ? "completed" : ""} ${
                active ? "current" : ""
              }`}
              key={step.phase}
              onClick={() => onSelectStage(step.phase)}
            >
              <div className="pathway-node">
                {completed ? <Check size={15} aria-hidden="true" /> : step.number}
              </div>
              <strong>{step.phase}</strong>
              <span>{detail}</span>
            </button>
          );
        })}
      </div>

      <div className="pathway-active-action" aria-live="polite">
        <div>
          <span>Aktuální krok · {activeStage}</span>
          <strong>{activeStatus}</strong>
          <small>
            {patient.nextStepDate
              ? `Termín: ${formatLongDate(patient.nextStepDate)}`
              : "Termín není určen"}
          </small>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={
            activeStage === "Příjem" && advanceAction
              ? onAdvancePhase
              : () => onSelectStage(activeStage)
          }
        >
          {activeActionLabel}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="pathway-secondary-status">
        <button type="button" onClick={() => onSelectStage("Terapie")}>
          Modifikátor terapie: <strong>{patient.treatmentRoute ?? "neurčen"}</strong>
        </button>
        <span aria-hidden="true">•</span>
        <span>
          Recidiva: <strong>{patient.recurrence ? "ano" : "ne"}</strong>
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  onAction,
}: {
  title: string;
  description: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Search size={22} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="button button-secondary" type="button" onClick={onAction}>
        Zrušit filtr
      </button>
    </div>
  );
}

function dateToIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function shiftMonth(value: string, difference: number) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + difference);
  return dateToIso(date);
}

function DashboardCalendar({
  tasks,
  openPatient,
  onClose,
}: {
  tasks: CareTask[];
  openPatient: (id: string) => void;
  onClose: () => void;
}) {
  const today = todayIso();
  const [visibleMonth, setVisibleMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(today);
  const monthDate = new Date(`${visibleMonth}T12:00:00`);
  const calendarDays = useMemo(() => {
    const currentMonth = new Date(`${visibleMonth}T12:00:00`);
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 12);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const firstVisibleDay = new Date(firstDay);
    firstVisibleDay.setDate(firstVisibleDay.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstVisibleDay);
      date.setDate(firstVisibleDay.getDate() + index);
      return date;
    });
  }, [visibleMonth]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, CareTask[]>();
    tasks.forEach((task) => grouped.set(task.date, [...(grouped.get(task.date) ?? []), task]));
    return grouped;
  }, [tasks]);
  const selectedTasks = [...(tasksByDate.get(selectedDate) ?? [])].sort((a, b) =>
    (a.time === "—" ? "99:99" : a.time).localeCompare(
      b.time === "—" ? "99:99" : b.time,
      "cs-CZ",
    ),
  );
  const monthLabel = new Intl.DateTimeFormat("cs-CZ", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const showToday = () => {
    setVisibleMonth(`${today.slice(0, 7)}-01`);
    setSelectedDate(today);
  };
  const moveMonth = (difference: number) => {
    const nextMonth = shiftMonth(visibleMonth, difference);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal dashboard-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-calendar-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="calendar-modal-header">
          <div>
            <p className="eyebrow">Úkoly a termíny</p>
            <h2 id="dashboard-calendar-heading">Kalendář péče</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít kalendář" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="calendar-modal-body">
          <div className="calendar-month-panel">
            <div className="calendar-month-toolbar">
              <button
                className="icon-button"
                type="button"
                aria-label="Předchozí měsíc"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <strong>{monthLabel}</strong>
              <button
                className="icon-button"
                type="button"
                aria-label="Následující měsíc"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={19} aria-hidden="true" />
              </button>
              <button className="button button-secondary calendar-today-button" type="button" onClick={showToday}>
                Dnes
              </button>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-month-grid">
              {calendarDays.map((date) => {
                const dateIso = dateToIso(date);
                const dayTasks = tasksByDate.get(dateIso) ?? [];
                const outsideMonth = date.getMonth() !== monthDate.getMonth();
                return (
                  <button
                    className={`calendar-day ${outsideMonth ? "outside-month" : ""} ${dateIso === today ? "today" : ""} ${dateIso === selectedDate ? "selected" : ""}`}
                    key={dateIso}
                    type="button"
                    aria-label={`${formatLongDate(dateIso)}, ${dayTasks.length} úkolů`}
                    aria-pressed={dateIso === selectedDate}
                    onClick={() => {
                      setSelectedDate(dateIso);
                      if (outsideMonth) setVisibleMonth(`${dateIso.slice(0, 7)}-01`);
                    }}
                  >
                    <span>{date.getDate()}</span>
                    {dayTasks.length ? <b>{dayTasks.length}</b> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="calendar-day-agenda">
            <div className="calendar-agenda-heading">
              <span>Vybraný den</span>
              <strong>{formatLongDate(selectedDate)}</strong>
              <small>{czechAppointmentCount(selectedTasks.length)}</small>
            </div>
            <div className="calendar-agenda-list">
              {selectedTasks.length ? selectedTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => { onClose(); openPatient(task.patientId); }}>
                  <time>{task.time}</time>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.patient}</span>
                  </div>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              )) : (
                <div className="calendar-empty-day">
                  <CalendarDays size={24} aria-hidden="true" />
                  <strong>Bez naplánovaných termínů</strong>
                  <span>Pro tento den není evidován žádný úkol.</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function OncologyRegistry() {
  const [session, setSession] = useState<OnkoFlowSession | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [auditEvents, setAuditEvents] = useState<RepositoryAuditEvent[]>([]);
  const [registryState, setRegistryState] = useState<"idle" | "loading" | "ready" | "saving" | "error">("idle");
  const [registryMessage, setRegistryMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [patientPhaseFilter, setPatientPhaseFilter] = useState<PatientPhaseFilter | null>(null);
  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isAdvancePhaseOpen, setIsAdvancePhaseOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<MajorStage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [viewHistory, setViewHistory] = useState<View[]>([]);

  const tasks = useMemo(() => deriveTasks(patients), [patients]);

  const selectedPatient =
    patients.find((patient) => patient.id === selectedPatientId) ?? patients[0];
  const currentViewLabel =
    activeView === "patient"
      ? "Detail pacienta"
      : (navItems.find((item) => item.id === activeView)?.label ?? "Přehled");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!session) return;

    let active = true;
    void loadRegistry(session.directory)
      .then((loaded) => {
        if (!active) return;
        setPatients(loaded.patients);
        setRevisions(loaded.revisions);
        setAuditEvents(loaded.auditEvents);
        setSelectedPatientId((current) =>
          loaded.patients.some((patient) => patient.id === current)
            ? current
            : (loaded.patients[0]?.id ?? ""),
        );
        setRegistryMessage(
          loaded.warnings.length
            ? `Některé soubory nebylo možné načíst: ${loaded.warnings.join("; ")}`
            : "",
        );
        setRegistryState("ready");
      })
      .catch((error) => {
        if (!active) return;
        setRegistryMessage(explainRepositoryError(error));
        setRegistryState("error");
      });

    return () => {
      active = false;
    };
  }, [reloadKey, session]);

  const navigate = (view: View) => {
    if (view !== activeView) setViewHistory((current) => [...current, activeView]);
    setActiveView(view);
    setSidebarOpen(false);
    setSearchQuery("");
    if (view === "patients") setPatientPhaseFilter(null);
  };

  const openPatientCategory = (
    label: string,
    phases: CarePhase[],
    treatmentRoutes?: TreatmentRoute[],
  ) => {
    setPatientPhaseFilter({ label, phases, treatmentRoutes });
    setSearchQuery("");
    if (activeView !== "patients") setViewHistory((current) => [...current, activeView]);
    setActiveView("patients");
    setSidebarOpen(false);
  };

  const openPatientSearch = () => {
    setPatientPhaseFilter(null);
    if (activeView !== "patients") setViewHistory((current) => [...current, activeView]);
    setActiveView("patients");
    setSidebarOpen(false);
  };

  const openPatient = (id: string) => {
    if (activeView !== "patient") setViewHistory((current) => [...current, activeView]);
    setSelectedPatientId(id);
    setActiveView("patient");
    setSidebarOpen(false);
  };

  const goBack = () => {
    const previous = viewHistory.at(-1);
    if (!previous) return;
    setViewHistory((current) => current.slice(0, -1));
    setActiveView(previous);
    setSidebarOpen(false);
  };

  const createPatient = async (patient: Patient) => {
    if (!session) throw new Error("Datová složka není připojena.");
    setRegistryState("saving");
    setRegistryMessage("");
    try {
      const saved = await createPatientRecord(session.directory, patient, SESSION_ACTOR);
      setPatients((current) => [saved.record.patient, ...current]);
      setRevisions((current) => ({ ...current, [patient.id]: saved.record.revision }));
      setAuditEvents((current) => [saved.auditEvent, ...current]);
      setSelectedPatientId(patient.id);
      setViewHistory((current) => [...current, activeView]);
      setActiveView("patient");
      setIsNewPatientOpen(false);
      setToast("Pacient byl bezpečně uložen do registru.");
    } catch (error) {
      const message = explainRepositoryError(error);
      setRegistryMessage(message);
      throw new Error(message);
    } finally {
      setRegistryState("ready");
    }
  };

  const savePatientChange = async (updatedPatient: Patient, action: string) => {
    if (!session) throw new Error("Datová složka není připojena.");
    const expectedRevision = revisions[updatedPatient.id];
    if (!expectedRevision) throw new Error("Chybí lokální revize záznamu. Obnovte registr.");
    setRegistryState("saving");
    setRegistryMessage("");
    try {
      const saved = await updatePatientRecord(
        session.directory,
        updatedPatient,
        expectedRevision,
        action,
        SESSION_ACTOR,
      );
      setPatients((current) =>
        current.map((patient) =>
          patient.id === updatedPatient.id ? saved.record.patient : patient,
        ),
      );
      setRevisions((current) => ({
        ...current,
        [updatedPatient.id]: saved.record.revision,
      }));
      setAuditEvents((current) => [saved.auditEvent, ...current]);
    } catch (error) {
      const message = explainRepositoryError(error);
      setRegistryMessage(message);
      throw new Error(message);
    } finally {
      setRegistryState("ready");
    }
  };

  const addEvent = async (event: TimelineEvent) => {
    if (!selectedPatient) return;
    const updatedPatient: Patient = {
      ...selectedPatient,
      ...(event.kind === "recurrence"
        ? {
            phase: "Recidiva" as const,
            recurrence: true,
            priority: "Vysoká" as const,
            nextStep: "Restaging a nové rozhodnutí MDT",
            nextStepDate: event.date,
          }
        : {}),
      events: [event, ...selectedPatient.events],
    };
    await savePatientChange(updatedPatient, `Přidána událost: ${event.title}`);
    setIsNewEventOpen(false);
    setToast("Nová událost byla uložena do časové osy.");
  };

  const advancePatient = async (input: WorkflowAdvanceInput) => {
    if (!selectedPatient || !session) return;
    const updatedPatient = advancePatientThroughWorkflow(selectedPatient, input, SESSION_ACTOR);
    if (!updatedPatient) {
      setToast("Pro posun pacienta je potřeba doplnit povinné údaje.");
      return;
    }

    await savePatientChange(
      updatedPatient,
      `Posun fáze: ${selectedPatient.phase} → ${updatedPatient.phase}`,
    );
    setIsAdvancePhaseOpen(false);
    setToast(`Pacient byl posunut do fáze ${updatedPatient.phase}.`);
  };

  if (!session) {
    return (
      <LoginScreen
        onLogin={(nextSession) => {
          setRegistryState("loading");
          setRegistryMessage("");
          setSession(nextSession);
        }}
      />
    );
  }

  if (registryState === "loading" || registryState === "idle") {
    return (
      <main className="login-page">
        <section className="login-card registry-state-card" aria-live="polite">
          <LoaderCircle className="spin" size={32} aria-hidden="true" />
          <h1>Načítám registr</h1>
          <p>Kontroluji datovou složku a načítám pacientské záznamy.</p>
        </section>
      </main>
    );
  }

  if (registryState === "error") {
    return (
      <main className="login-page">
        <section className="login-card registry-state-card" role="alert">
          <AlertTriangle size={32} aria-hidden="true" />
          <h1>Registr nelze načíst</h1>
          <p>{registryMessage}</p>
          <div className="registry-state-actions">
            <button className="button button-primary" type="button" onClick={() => {
              setRegistryState("loading");
              setRegistryMessage("");
              setReloadKey((value) => value + 1);
            }}>
              Zkusit znovu
            </button>
            <button className="button button-secondary" type="button" onClick={() => setSession(null)}>
              Změnit složku
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Image
              className="brand-icon"
              src="/pwa-512.png"
              alt=""
              width={38}
              height={38}
              priority
              unoptimized
            />
          </div>
          <div>
            <div className="brand-name">OnkoFlow</div>
            <div className="brand-subtitle">GYN onkologický registr</div>
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Zavřít navigaci"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Hlavní navigace">
          <p className="nav-label">Pracovní prostor</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeView === item.id || (item.id === "patients" && activeView === "patient");
            return (
              <Fragment key={item.id}>
                {item.id === "storage" ? <p className="nav-label nav-label-admin">Správa</p> : null}
                <button
                  className={`nav-item ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => navigate(item.id)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === "tasks" ? <span className="nav-count">{tasks.length}</span> : null}
                </button>
              </Fragment>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="security-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Provozní registr</strong>
            <span>Zápis do datové složky aktivní</span>
          </div>
        </div>

        <div className="user-card">
          <div className="avatar avatar-small">
            <FolderOpen size={17} aria-hidden="true" />
          </div>
          <div className="user-card-copy">
            <strong>Datová složka</strong>
            <span>{session.directoryName}</span>
          </div>
          <button
            className="user-logout-button"
            type="button"
            aria-label="Odpojit datovou složku"
            title="Odpojit"
            onClick={() => setSession(null)}
          >
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Zavřít navigaci"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button topbar-back-button"
            type="button"
            aria-label="Zpět"
            title="Zpět"
            onClick={goBack}
            disabled={viewHistory.length === 0}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <button
            className="icon-button menu-button"
            type="button"
            aria-label="Otevřít navigaci"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-location">
            <span>Gynekologická onkologie</span>
            <strong>{currentViewLabel}</strong>
          </div>
          <form
            className="topbar-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              openPatientSearch();
            }}
          >
            <Search size={19} aria-hidden="true" />
            <label className="sr-only" htmlFor="global-patient-search">Hledat pacientku</label>
            <input
              id="global-patient-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Hledat jméno, RČ nebo diagnózu…"
            />
          </form>
          <div className="topbar-actions">
            <div className="topbar-session" title={`Datová složka: ${session.directoryName}`}>
              <span className="avatar avatar-tiny">
                <FolderOpen size={14} aria-hidden="true" />
              </span>
              <div>
                <strong>{registryState === "saving" ? "Ukládám…" : "Registr připojen"}</strong>
                <span>{session.directoryName}</span>
              </div>
            </div>
            <button
              className="button button-primary topbar-new"
              type="button"
              aria-label="Přijmout nového pacienta"
              onClick={() => setIsNewPatientOpen(true)}
              disabled={registryState === "saving"}
            >
              <Plus size={18} aria-hidden="true" />
              <span className="topbar-new-label">Nový pacient</span>
            </button>
          </div>
        </header>

        <section className="page-content">
          {registryMessage ? (
            <div className="storage-alert warning registry-warning" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Upozornění datového úložiště</strong>
                <span>{registryMessage}</span>
              </div>
            </div>
          ) : null}
          {activeView === "dashboard" && (
            <DashboardView
              patients={patients}
              tasks={tasks}
              openPatient={openPatient}
              navigate={navigate}
              openPatientCategory={openPatientCategory}
            />
          )}
          {activeView === "patients" && (
            <PatientsView
              patients={patients}
              query={searchQuery}
              setQuery={setSearchQuery}
              openPatient={openPatient}
              phaseFilter={patientPhaseFilter}
              clearPhaseFilter={() => setPatientPhaseFilter(null)}
            />
          )}
          {activeView === "patient" && selectedPatient && (
            <PatientDetail
              patient={selectedPatient}
              openNewEvent={() => setIsNewEventOpen(true)}
              openAdvancePhase={() => setIsAdvancePhaseOpen(true)}
              openStage={setSelectedStage}
            />
          )}
          {activeView === "tasks" && <TasksView tasks={tasks} openPatient={openPatient} />}
          {activeView === "storage" && <StorageDiagnostics />}
          {activeView === "audit" && <AuditView events={auditEvents} patients={patients} />}
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobilní navigace">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            activeView === item.id || (item.id === "patients" && activeView === "patient");
          return (
            <button
              className={`mobile-nav-item ${active ? "active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
            >
              <span className="mobile-nav-icon">
                <Icon size={20} aria-hidden="true" />
                {item.id === "tasks" ? (
                  <span className="mobile-nav-count">{tasks.length}</span>
                ) : null}
              </span>
              <span>
                {item.id === "tasks"
                  ? "Úkoly"
                  : item.id === "audit"
                    ? "Audit"
                    : item.id === "storage"
                      ? "Úložiště"
                      : item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {isNewPatientOpen && (
        <NewPatientModal
          currentUser={SESSION_ACTOR}
          onClose={() => setIsNewPatientOpen(false)}
          onCreate={createPatient}
        />
      )}

      {isNewEventOpen && selectedPatient && (
        <NewEventModal
          patient={selectedPatient}
          currentUser={SESSION_ACTOR}
          onClose={() => setIsNewEventOpen(false)}
          onCreate={addEvent}
        />
      )}

      {isAdvancePhaseOpen && selectedPatient && (
        <AdvancePatientModal
          patient={selectedPatient}
          onClose={() => setIsAdvancePhaseOpen(false)}
          onAdvance={advancePatient}
        />
      )}

      {selectedStage && selectedPatient && (
        <StageDetailModal
          patient={selectedPatient}
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
          onSave={async (updatedPatient, action) => {
            await savePatientChange(updatedPatient, action);
            setSelectedStage(null);
            setToast("Údaje fáze byly uloženy.");
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={19} aria-hidden="true" />
          {toast}
        </div>
      )}
    </div>
  );
}

function DashboardView({
  patients,
  tasks,
  openPatient,
  navigate,
  openPatientCategory,
}: {
  patients: Patient[];
  tasks: CareTask[];
  openPatient: (id: string) => void;
  navigate: (view: View) => void;
  openPatientCategory: (
    label: string,
    phases: CarePhase[],
    treatmentRoutes?: TreatmentRoute[],
  ) => void;
}) {
  const today = todayIso();
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("all");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const dashboardActions = useMemo(
    () =>
      patients
        .map((patient) => getPatientDashboardAction(patient, today))
        .filter((action): action is DashboardAction => Boolean(action))
        .sort(
          (a, b) =>
            getDashboardActionSortRank(a, today) - getDashboardActionSortRank(b, today) ||
            DASHBOARD_TONE_PRIORITY[a.tone] - DASHBOARD_TONE_PRIORITY[b.tone] ||
            (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") ||
            a.patientName.localeCompare(b.patientName, "cs-CZ"),
        ),
    [patients, today],
  );
  const actionable = dashboardActions.filter((action) => action.tone !== "scheduled");
  const actionByPatientId = useMemo(
    () => new Map(dashboardActions.map((action) => [action.patientId, action])),
    [dashboardActions],
  );
  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );
  const filteredActions = actionable.filter((action) => {
    const patient = patientById.get(action.patientId);
    return patient
      ? patientMatchesDashboardFilter(patient, action, dashboardFilter, today)
      : false;
  });
  const visibleActions = filteredActions.slice(0, 10);
  const overdueCount = dashboardActions.filter((action) =>
    action.timing.toLocaleLowerCase("cs-CZ").startsWith("po termínu"),
  ).length;
  const waitingResultCount = dashboardActions.filter((action) =>
    action.title.toLocaleLowerCase("cs-CZ").includes("čeká na výsledek") ||
    action.title.toLocaleLowerCase("cs-CZ").includes("čeká na závěr"),
  ).length;
  const mdtToday = patients.filter((patient) => patient.mdtDate === today).length;
  const upcomingTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.date >= today)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [tasks, today],
  );
  const dashboardPatients = [...patients]
    .filter((patient) =>
      patientMatchesDashboardFilter(
        patient,
        actionByPatientId.get(patient.id),
        dashboardFilter,
        today,
      ),
    )
    .sort((a, b) => {
      const actionA = actionByPatientId.get(a.id);
      const actionB = actionByPatientId.get(b.id);
      return (
        (actionA ? getDashboardActionSortRank(actionA, today) : 9) -
          (actionB ? getDashboardActionSortRank(actionB, today) : 9) ||
        (actionA?.date || "9999-12-31").localeCompare(actionB?.date || "9999-12-31")
      );
    })
    .slice(0, 10);
  const todayLabel = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${today}T12:00:00`));

  const getStageStatusLines = (label: string, stagePatients: Patient[]) => {
    if (!stagePatients.length) return ["Bez aktivních případů"];
    if (label === "Příjem") return [`${stagePatients.length} k dokončení příjmu`];
    if (label === "Biopsie") {
      const statuses = stagePatients.map((patient) => getBiopsyStatus(patient, today));
      const rows = [
        ["Čekání na termín biopsie", "čekají na termín"],
        ["Dnes biopsie", "biopsie dnes"],
        ["Čekání na výsledek biopsie", "čekají na histologii"],
        ["Biopsie nenaplánována", "bez termínu"],
      ] as const;
      return rows
        .map(([status, description]) => ({ count: statuses.filter((item) => item === status).length, description }))
        .filter((row) => row.count)
        .map((row) => `${row.count} ${row.description}`)
        .slice(0, 3);
    }
    if (label === "Staging") {
      const examinations = stagePatients.flatMap(getPatientStagingDetails);
      const withoutDate = examinations.filter((item) => !item.date && !item.result.trim()).length;
      const todayExaminations = examinations.filter((item) => item.date === today && !item.result.trim()).length;
      const waiting = examinations.filter(
        (item) => item.date && item.date < today && !item.result.trim(),
      ).length;
      const rows = [
        [todayExaminations, "vyšetření dnes"],
        [waiting, "čekají na výsledky"],
        [withoutDate, "bez termínu"],
      ] as const;
      const result = rows.filter(([count]) => count).map(([count, description]) => `${count} ${description}`);
      return result.length ? result : [`${stagePatients.length} staging dokončen`];
    }
    if (label === "MDT") {
      const statuses = stagePatients.map((patient) => getMdtStatus(patient, today));
      const todayCount = statuses.filter((status) => status === "MDT dnes").length;
      const awaiting = statuses.filter((status) => status === "Čekání na MDT").length;
      const conclusion = statuses.filter((status) => status === "Čekání na závěr MDT").length;
      const result = [
        [todayCount, "MDT dnes"],
        [awaiting, "čekají na MDT"],
        [conclusion, "čekají na závěr"],
      ]
        .filter(([count]) => count)
        .map(([count, description]) => `${count} ${description}`);
      return result.length ? result : ["Termín MDT neurčen"];
    }
    return [];
  };

  const stageSummaries = processSummarySteps.slice(0, -1).map((step) => {
    const stagePatients = patients.filter((patient) => step.phases.includes(patient.phase));
    const stageActions = stagePatients
      .map((patient) => actionByPatientId.get(patient.id))
      .filter((action): action is DashboardAction => Boolean(action));
    const state = stageActions.some((action) => getDashboardActionSortRank(action, today) === 0)
      ? "overdue"
      : stageActions.some((action) => action.tone !== "scheduled")
        ? "attention"
        : stagePatients.length
          ? "active"
          : "empty";
    return {
      ...step,
      patients: stagePatients,
      count: stagePatients.length,
      status: getStageStatusLines(step.label, stagePatients)[0] ?? "Bez aktivních případů",
      state,
    };
  });
  const maxStageCount = Math.max(1, ...stageSummaries.map((step) => step.count));
  const recurrenceStep = processSummarySteps.at(-1);
  const recurrenceCount = recurrenceStep
    ? patients.filter((patient) => recurrenceStep.phases.includes(patient.phase)).length
    : 0;
  const therapyPhases: CarePhase[] =
    stageSummaries.find((step) => step.label === "Terapie")?.phases ?? ["Terapie"];

  const changeDashboardFilter = (filter: DashboardFilter) => {
    setDashboardFilter((current) => current === filter ? "all" : filter);
  };
  const patientFilters: Array<{ id: DashboardFilter; label: string }> = [
    { id: "all", label: "Vše" },
    { id: "action", label: `Vyžaduje akci ${actionable.length}` },
    { id: "overdue", label: `Po termínu ${overdueCount}` },
    { id: "Biopsie", label: "Biopsie" },
    { id: "Staging", label: "Staging" },
    { id: "MDT", label: "MDT" },
    { id: "Terapie", label: "Terapie" },
  ];

  return (
    <>
      <div className="page-heading heading-with-action dashboard-heading">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>Přehled péče</h1>
          <p>Aktuální stav pacientů a nejbližší kroky v onkologickém procesu.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => setIsCalendarOpen(true)}>
          <CalendarDays size={17} aria-hidden="true" />
          Zobrazit kalendář
        </button>
      </div>

      <div className="metric-grid operational-metrics">
        <button
          className={`metric-card metric-action ${dashboardFilter === "action" ? "active" : ""}`}
          type="button"
          aria-pressed={dashboardFilter === "action"}
          onClick={() => changeDashboardFilter("action")}
        >
          <div className="metric-icon metric-amber"><AlertTriangle size={21} aria-hidden="true" /></div>
          <span className="metric-label">Vyžaduje akci</span>
          <strong>{actionable.length}</strong>
        </button>
        <button
          className={`metric-card metric-overdue ${dashboardFilter === "overdue" ? "active" : ""}`}
          type="button"
          aria-pressed={dashboardFilter === "overdue"}
          onClick={() => changeDashboardFilter("overdue")}
        >
          <div className="metric-icon metric-red"><Clock3 size={21} aria-hidden="true" /></div>
          <span className="metric-label">Po termínu</span>
          <strong>{overdueCount}</strong>
        </button>
        <button
          className={`metric-card ${dashboardFilter === "mdt-today" ? "active" : ""}`}
          type="button"
          aria-pressed={dashboardFilter === "mdt-today"}
          onClick={() => changeDashboardFilter("mdt-today")}
        >
          <div className="metric-icon metric-violet"><UsersRound size={21} aria-hidden="true" /></div>
          <span className="metric-label">MDT dnes</span>
          <strong>{mdtToday}</strong>
        </button>
        <button
          className={`metric-card ${dashboardFilter === "waiting-result" ? "active" : ""}`}
          type="button"
          aria-pressed={dashboardFilter === "waiting-result"}
          onClick={() => changeDashboardFilter("waiting-result")}
        >
          <div className="metric-icon metric-blue"><FileCheck2 size={21} aria-hidden="true" /></div>
          <span className="metric-label">Čeká na výsledek</span>
          <strong>{waitingResultCount}</strong>
        </button>
      </div>

      <div className="dashboard-overview-stack">
      <section className="panel process-panel process-panel-top operational-process">
        <div className="panel-header">
          <div>
            <h2>Proces onkologické péče</h2>
            <p>
              Hlavní klinické fáze; termíny a čekání se zobrazují jako stav dané fáze.
            </p>
          </div>
          <span className="panel-meta">Aktualizováno právě teď</span>
        </div>
        <div className="compact-care-pipeline" aria-label="Rozložení pacientů podle fáze péče">
          {stageSummaries.map((step) => (
            <button
              className={`compact-pipeline-stage pipeline-${step.state}`}
              type="button"
              key={step.number}
              onClick={() => openPatientCategory(step.label, step.phases)}
              aria-label={`${step.label}: ${czechPatientCount(step.count)}. Otevřít seznam.`}
            >
              <span className="compact-pipeline-heading">
                <span className="pipeline-sequence">{step.number}</span>
                <strong>{step.label}</strong>
                <b>{step.count}</b>
              </span>
              <span className="pipeline-distribution" aria-hidden="true">
                <i style={{ width: `${step.count ? Math.max(4, (step.count / maxStageCount) * 100) : 0}%` }} />
              </span>
              <small>{step.status}</small>
            </button>
          ))}
        </div>
        <div className="pipeline-secondary-row">
          <div className="pipeline-therapy-branches">
            <span>Terapie</span>
            {treatmentRoutes.map((route) => (
              <button
                type="button"
                key={route.code}
                onClick={() => openPatientCategory(route.label, therapyPhases, [route.label])}
              >
                <span>{route.label}</span>
                <b>{patients.filter((patient) => patient.treatmentRoute === route.label).length}</b>
              </button>
            ))}
          </div>
          {recurrenceStep ? (
            <button
              className="pipeline-recurrence"
              type="button"
              onClick={() => openPatientCategory(recurrenceStep.label, recurrenceStep.phases)}
            >
              <History size={17} aria-hidden="true" />
              <span><small>Nová onkologická epizoda</small><strong>Recidiva</strong></span>
              <b>{recurrenceCount}</b>
            </button>
          ) : null}
        </div>
      </section>

      <div className="dashboard-grid operational-dashboard-grid">
        <section className="panel patients-panel">
          <div className="panel-header">
            <div>
              <h2>Vyžaduje akci</h2>
              <p>Automaticky seřazeno podle naléhavosti a termínu.</p>
            </div>
            <span className="queue-total">{czechPatientCount(filteredActions.length)}</span>
          </div>
          <div className="patient-list-compact">
            {visibleActions.length ? visibleActions.map((action) => (
              <button
                className={`patient-compact-row action-queue-row action-${action.tone}`}
                key={action.id}
                type="button"
                onClick={() => openPatient(action.patientId)}
              >
                <span className="action-indicator" aria-hidden="true" />
                <div className="action-patient">
                  <strong>{action.patientName}</strong>
                  <span>{action.diagnosis} · {action.stage}</span>
                </div>
                <div className="action-description">
                  <strong>{action.title}</strong>
                  {action.date ? <span>{formatDate(action.date)}</span> : null}
                </div>
                <span className={`date-status date-status-${action.tone}`}>{action.timing}</span>
                <span className="action-open">Otevřít <ChevronRight size={18} aria-hidden="true" /></span>
              </button>
            )) : (
              <div className="empty-state compact-empty-state">
                <h3>Žádná pacientka nyní nevyžaduje akci</h3>
                <p>Aktuální termíny a čekající výsledky se zobrazí automaticky.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel schedule-panel">
          <div className="panel-header">
            <div>
              <h2>Dnes / nejbližší termíny</h2>
              <p>Chronologický přehled naplánovaných kroků.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Otevřít úkoly" onClick={() => navigate("tasks")}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="task-stack">
            {upcomingTasks.length ? upcomingTasks.slice(0, 4).map((task) => (
              <button className="task-card" key={task.id} type="button" onClick={() => openPatient(task.patientId)}>
                <div className="task-date-block">
                  <strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong>
                  <span>{formatDate(task.date, false).split(" ")[1]}</span>
                </div>
                <span className="agenda-type-icon" aria-hidden="true">
                  <CalendarDays size={15} />
                </span>
                <div className="task-copy">
                  <strong>{task.title}</strong>
                  <span>
                    {task.time} · {task.patient}
                  </span>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )) : (
              <div className="empty-state compact-empty-state">
                <h3>Žádné naplánované úkoly</h3>
                <p>Termíny vzniknou při práci se záznamem pacienta.</p>
              </div>
            )}
          </div>
          <button className="button button-soft schedule-button" type="button" onClick={() => navigate("tasks")}>
            <ListChecks size={17} aria-hidden="true" />
            Všechny úkoly
          </button>
        </section>
      </div>

      <section className="panel dashboard-patient-directory">
        <div className="panel-header">
          <div>
            <h2>Pacientky</h2>
            <p>Aktivní případy seřazené podle naléhavosti dalšího kroku.</p>
          </div>
          <button className="text-button" type="button" onClick={() => navigate("patients")}>
            Celý seznam <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="dashboard-patient-filters" aria-label="Filtrovat pacientky">
          {patientFilters.map((filter) => (
            <button
              className={dashboardFilter === filter.id ? "active" : ""}
              type="button"
              key={filter.id}
              aria-pressed={dashboardFilter === filter.id}
              onClick={() => setDashboardFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {dashboardPatients.length ? (
          <div className="dashboard-patient-table-wrap">
            <table className="dashboard-patient-table">
              <thead><tr><th>Pacientka</th><th>Diagnóza</th><th>Fáze</th><th>Stav</th><th>Další krok</th><th>Termín</th><th>Čeká</th><th /></tr></thead>
              <tbody>
                {dashboardPatients.map((patient) => {
                  const action = actionByPatientId.get(patient.id);
                  return (
                    <tr key={patient.id} onClick={() => openPatient(patient.id)}>
                      <td><strong>{patient.lastName} {patient.firstName}</strong><span>r. č. {patient.birthNumber}</span></td>
                      <td><strong>{patient.primaryDiagnosisCode}</strong><span>{patient.primaryDiagnosisLabel}</span></td>
                      <td><PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} /></td>
                      <td>{action ? <span className={`table-status-dot table-status-${action.tone}`} aria-label={action.timing} /> : "—"}</td>
                      <td><strong>{action?.title ?? patient.nextStep}</strong></td>
                      <td>{action?.date ? <time dateTime={action.date}>{formatDate(action.date)}</time> : "—"}</td>
                      <td>{action ? <span className={`date-status date-status-${action.tone}`}>{action.timing}</span> : "—"}</td>
                      <td><ChevronRight size={19} aria-hidden="true" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty-state"><h3>Filtru neodpovídá žádná pacientka</h3><p>Zvolte jiný filtr nebo zobrazte všechny pacientky.</p></div>
        )}
      </section>
      </div>

      {isCalendarOpen ? (
        <DashboardCalendar
          tasks={tasks}
          openPatient={openPatient}
          onClose={() => setIsCalendarOpen(false)}
        />
      ) : null}
    </>
  );
}

function PatientsView({
  patients,
  query,
  setQuery,
  openPatient,
  phaseFilter,
  clearPhaseFilter,
}: {
  patients: Patient[];
  query: string;
  setQuery: (value: string) => void;
  openPatient: (id: string) => void;
  phaseFilter: PatientPhaseFilter | null;
  clearPhaseFilter: () => void;
}) {
  const [mdtDateFilter, setMdtDateFilter] = useState("");

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("cs-CZ");
    return patients
      .filter((patient) => {
        if (phaseFilter && !phaseFilter.phases.includes(patient.phase)) return false;
        if (
          phaseFilter?.treatmentRoutes?.length &&
          (!patient.treatmentRoute || !phaseFilter.treatmentRoutes.includes(patient.treatmentRoute))
        ) {
          return false;
        }
        if (mdtDateFilter && patient.mdtDate !== mdtDateFilter) return false;
        if (!normalized) return true;
        return [
          patient.firstName,
          patient.lastName,
          patient.birthNumber,
          patient.mdtDate ?? "",
          patient.mdtDate ? formatDate(patient.mdtDate) : "",
          patient.primaryDiagnosisCode,
          patient.primaryDiagnosisLabel,
          patient.physician,
          patient.mdtDetails?.operator ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("cs-CZ")
          .includes(normalized);
      })
      .sort(
        (a, b) =>
          (b.mdtDate ?? "").localeCompare(a.mdtDate ?? "") ||
          a.lastName.localeCompare(b.lastName, "cs-CZ"),
      );
  }, [mdtDateFilter, patients, phaseFilter, query]);

  const clearFilters = () => {
    setQuery("");
    setMdtDateFilter("");
    clearPhaseFilter();
  };

  const selectMdtDate = (date: string) => {
    setMdtDateFilter(date);
    setQuery("");
    if (date) clearPhaseFilter();
  };

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Evidence pacientů</p>
          <h1>
            {mdtDateFilter
              ? `MDT ${formatDate(mdtDateFilter)}`
              : phaseFilter
                ? phaseFilter.label
                : "Pacienti"}
          </h1>
          <p>
            {mdtDateFilter
              ? `Pacienti projednávaní na MDT dne ${formatLongDate(mdtDateFilter)}.`
              : phaseFilter
              ? "Pacienti v této aktuální fázi onkologického procesu."
              : "Seznam pacientů seřazený podle data MDT."}
          </p>
        </div>
      </div>

      <section className="panel patient-directory">
        <div className="directory-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Vyhledat pacienta</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hledat podle jména, r. č., diagnózy, MKN nebo data MDT…"
            />
            {query && (
              <button type="button" aria-label="Vymazat vyhledávání" onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
          </label>
          <label className="mdt-date-filter">
            <CalendarDays size={17} aria-hidden="true" />
            <span className="sr-only">Filtrovat podle data MDT</span>
            <input
              type="date"
              value={mdtDateFilter}
              onChange={(event) => selectMdtDate(event.target.value)}
              aria-label="Filtrovat podle data MDT"
            />
          </label>
          {phaseFilter ? (
            <button className="phase-filter-chip" type="button" onClick={clearPhaseFilter}>
              Fáze: {phaseFilter.label}
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
          {mdtDateFilter ? (
            <button className="phase-filter-chip" type="button" onClick={() => setMdtDateFilter("")}>
              MDT: {formatDate(mdtDateFilter)}
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
          <div className="directory-count">
            <strong>{filteredPatients.length}</strong> z {patients.length} pacientů
          </div>
        </div>

        {filteredPatients.length ? (
          <>
            <div className="patient-table-wrap">
              <table className="patient-table">
              <thead>
                <tr>
                  <th>Jméno pacienta</th>
                  <th>RČ</th>
                  <th>MDT</th>
                  <th>Diagnóza</th>
                  <th>MKN dg.</th>
                  <th>Operatér / lékař</th>
                  <th>
                    <span className="sr-only">Akce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} onClick={() => openPatient(patient.id)}>
                    <td>
                      <div className="table-patient-cell">
                        <div className="avatar">{patient.initials}</div>
                        <div>
                          <strong>
                            {patient.firstName} {patient.lastName}
                          </strong>
                          <span>{calculateAge(patient.dateOfBirth)} let</span>
                        </div>
                      </div>
                    </td>
                    <td className="birth-number-cell">{patient.birthNumber}</td>
                    <td>
                      {patient.mdtDate ? (
                        <button
                          className="mdt-date-link"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectMdtDate(patient.mdtDate ?? "");
                          }}
                          aria-label={`Zobrazit všechny pacienty MDT ${formatLongDate(patient.mdtDate)}`}
                        >
                          {formatDate(patient.mdtDate)}
                        </button>
                      ) : (
                        <span className="table-empty-value">—</span>
                      )}
                    </td>
                    <td>
                      <div className="diagnosis-cell">
                        <strong>{patient.primaryDiagnosisLabel}</strong>
                      </div>
                    </td>
                    <td><strong className="mkn-code">{patient.primaryDiagnosisCode}</strong></td>
                    <td>{patient.mdtDetails?.operator || patient.physician}</td>
                    <td>
                      <button
                        className="icon-button table-open-button"
                        type="button"
                        aria-label={`Otevřít pacienta ${patient.firstName} ${patient.lastName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openPatient(patient.id);
                        }}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <div className="patient-mobile-list">
              {filteredPatients.map((patient) => (
                <article
                  className="patient-mobile-card"
                  key={patient.id}
                >
                  <button
                    className="patient-mobile-open"
                    type="button"
                    onClick={() => openPatient(patient.id)}
                  >
                    <div className="patient-mobile-identity">
                      <div className="avatar">{patient.initials}</div>
                      <div>
                        <strong>
                          {patient.firstName} {patient.lastName}
                        </strong>
                        <span>
                          {calculateAge(patient.dateOfBirth)} let · r. č. {patient.birthNumber}
                        </span>
                      </div>
                      <ChevronRight size={20} aria-hidden="true" />
                    </div>
                    <div className="patient-mobile-diagnosis">
                      <span>{patient.primaryDiagnosisCode}</span>
                      <strong>{patient.primaryDiagnosisLabel}</strong>
                      <PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} />
                    </div>
                    <div className="patient-mobile-next">
                      <div>
                        <span>Další krok</span>
                        <strong>{patient.nextStep}</strong>
                      </div>
                      <time dateTime={patient.nextStepDate}>{formatDate(patient.nextStepDate)}</time>
                    </div>
                  </button>
                  <button
                    className="patient-mobile-mdt"
                    type="button"
                    disabled={!patient.mdtDate}
                    onClick={() => {
                      selectMdtDate(patient.mdtDate ?? "");
                    }}
                    aria-label={patient.mdtDate ? `Zobrazit všechny pacienty MDT ${formatLongDate(patient.mdtDate)}` : "MDT není naplánováno"}
                  >
                    <span>Datum MDT</span>
                    {patient.mdtDate ? (
                      <time dateTime={patient.mdtDate}>{formatDate(patient.mdtDate)}</time>
                    ) : (
                      <strong>Nenaplánováno</strong>
                    )}
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="Žádný pacient neodpovídá filtru"
            description="Zkuste upravit hledaný výraz nebo zobrazit celý seznam."
            onAction={clearFilters}
          />
        )}
      </section>
    </>
  );
}

function PatientDetail({
  patient,
  openNewEvent,
  openAdvancePhase,
  openStage,
}: {
  patient: Patient;
  openNewEvent: () => void;
  openAdvancePhase: () => void;
  openStage: (stage: MajorStage) => void;
}) {
  const advanceAction = getWorkflowAdvanceAction(patient);
  const patientStagingDetails = getPatientStagingDetails(patient);
  const completedStagingCount = patientStagingDetails.filter(
    (examination) => examination.date && examination.result.trim(),
  ).length;

  return (
    <>
      <section className="patient-hero panel">
        <div className="patient-hero-main">
          <div className="avatar patient-header-avatar">{patient.initials}</div>
          <div className="patient-hero-identity">
            <div className="patient-hero-title">
              <h1>
                {patient.firstName} {patient.lastName}
              </h1>
              <PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} />
            </div>
            <div className="patient-meta-line">
              <span>{calculateAge(patient.dateOfBirth)} let</span>
              <span>r. č. {patient.birthNumber}</span>
              <span>{patient.primaryDiagnosisCode} · {patient.primaryDiagnosisLabel}</span>
            </div>
          </div>
        </div>
        <div className="patient-hero-actions">
          <button className="button button-secondary" type="button" onClick={openNewEvent}>
            <Plus size={18} aria-hidden="true" />
            Nová událost
          </button>
        </div>
      </section>

      <section
        className="panel care-pathway-panel patient-profile-pathway"
        aria-labelledby="patient-pathway-heading"
      >
        <div className="panel-header patient-pathway-header">
          <div>
            <p className="eyebrow">Aktuální fáze pacienta</p>
            <h2 id="patient-pathway-heading">Průběh onkologické péče</h2>
          </div>
          <div className="patient-pathway-status">
            <PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} />
            <span className="progress-value">{patient.progress} % procesu</span>
          </div>
        </div>
        <PatientPathway
          patient={patient}
          onSelectStage={openStage}
          onAdvancePhase={openAdvancePhase}
          advanceAction={advanceAction}
        />
      </section>

      <div className="patient-detail-grid">
        <div className="patient-detail-main">
          <section className="panel diagnosis-overview">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Onkologická epizoda</p>
                <h2>Diagnóza a stav péče</h2>
              </div>
              <PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} />
            </div>
            <div className="diagnosis-highlight">
              <strong>{patient.primaryDiagnosisCode}</strong>
              <span aria-hidden="true">|</span>
              <h3>{patient.primaryDiagnosisLabel}</h3>
              <small>{patient.diagnosisCertainty}</small>
            </div>
            <div className="episode-facts">
              <div>
                <span>Přijetí do péče</span>
                <strong>{formatLongDate(patient.intakeDate)}</strong>
              </div>
              <div>
                <span>Odpovědný lékař</span>
                <strong>{patient.physician}</strong>
              </div>
              <div>
                <span>Vedlejší diagnózy</span>
                <strong>{patient.secondaryDiagnoses.join(", ") || "Bez záznamu"}</strong>
              </div>
            </div>
            <div className="clinical-status-links" aria-label="Klinická data pacienta">
              <button type="button" onClick={() => openStage("Biopsie")}>
                <span className={patient.biopsyResult?.conclusion ? "status-complete" : "status-waiting"}>
                  {patient.biopsyResult?.conclusion ? <Check size={16} /> : <Clock3 size={16} />}
                </span>
                <div>
                  <strong>Biopsie</strong>
                  <small>
                    {patient.biopsyResult?.conclusion && patient.biopsyResult.date
                      ? `Výsledek ${formatDate(patient.biopsyResult.date)}`
                      : getBiopsyDisplayStatus(patient)}
                  </small>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => openStage("Staging")}>
                <span className={
                  patientStagingDetails.length > 0 && completedStagingCount === patientStagingDetails.length
                    ? "status-complete"
                    : "status-active"
                }>
                  {patientStagingDetails.length > 0 && completedStagingCount === patientStagingDetails.length
                    ? <Check size={16} />
                    : <ScanLine size={16} />}
                </span>
                <div>
                  <strong>Staging</strong>
                  <small>
                    {patientStagingDetails.length
                      ? `${completedStagingCount}/${patientStagingDetails.length} vyšetření dokončeno`
                      : "Vyšetření nejsou vybrána"}
                  </small>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => openStage("MDT")}>
                <span className={patient.mdtConclusion ? "status-complete" : "status-waiting"}>
                  {patient.mdtConclusion ? <Check size={16} /> : <UsersRound size={16} />}
                </span>
                <div>
                  <strong>MDT</strong>
                  <small>{getMdtDisplayStatus(patient)}</small>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="panel timeline-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Chronologický záznam</p>
                <h2>Časová osa</h2>
              </div>
              <button
                className="button button-soft"
                type="button"
                aria-label="Přidat událost"
                onClick={openNewEvent}
              >
                <Plus size={17} aria-hidden="true" />
                Nová událost
              </button>
            </div>
            <div className="timeline">
              {patient.events.map((event) => {
                const Icon = eventIcons[event.kind];
                return (
                  <article className="timeline-event" key={event.id}>
                    <div className={`timeline-icon timeline-${event.kind}`}>
                      <Icon size={16} aria-hidden="true" />
                    </div>
                    <div className="timeline-date">
                      <strong>{formatDate(event.date)}</strong>
                      <span>{event.time || "—"}</span>
                    </div>
                    <div className="timeline-card">
                      <h3>{eventKindLabels[event.kind]} · {event.title}</h3>
                      <p>{event.description}</p>
                    </div>
                    <span className="timeline-author">{event.author}</span>
                    <span className={`event-status status-${event.status.replaceAll(" ", "-").toLowerCase()}`}>
                      {event.status}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="patient-detail-aside">
          <section className="panel info-card">
            <div className="panel-header compact">
              <h2>Kontrolní body</h2>
            </div>
            <div className="checklist">
              <div className="checklist-row done">
                <CircleCheck size={18} aria-hidden="true" />
                <span>Identifikace ověřena</span>
              </div>
              <div className="checklist-row done">
                <CircleCheck size={18} aria-hidden="true" />
                <span>Hlavní diagnóza zadána</span>
              </div>
              <div className="checklist-row done">
                <CircleCheck size={18} aria-hidden="true" />
                <span>Odpovědný lékař určen</span>
              </div>
              <div className="checklist-row">
                <Clock3 size={18} aria-hidden="true" />
                <span>Dokončení aktuální fáze</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function TasksView({
  tasks,
  openPatient,
}: {
  tasks: CareTask[];
  openPatient: (id: string) => void;
}) {
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [tasks],
  );
  const today = todayIso();
  const endOfWeek = addDaysIso(today, 6);
  const todayCount = tasks.filter((task) => task.date === today).length;
  const thisWeekCount = tasks.filter(
    (task) => task.date >= today && task.date <= endOfWeek,
  ).length;
  const highPriorityCount = tasks.filter((task) => task.priority === "Vysoká").length;

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Koordinace péče</p>
        <h1>Úkoly a termíny</h1>
        <p>
          Nové události a termíny se zadávají v detailu konkrétního pacienta.
        </p>
      </div>

      <div className="task-metrics">
        <div className="task-metric">
          <span>Dnes</span>
          <strong>{todayCount}</strong>
        </div>
        <div className="task-metric">
          <span>Tento týden</span>
          <strong>{thisWeekCount}</strong>
        </div>
        <div className="task-metric warning">
          <span>Vyšší priorita</span>
          <strong>{highPriorityCount}</strong>
        </div>
      </div>

      <section className="panel tasks-directory">
        <div className="panel-header">
          <div>
            <h2>Nadcházející</h2>
            <p>Seřazeno podle nejbližšího termínu.</p>
          </div>
        </div>
        <div className="large-task-list">
          {sortedTasks.map((task) => (
            <button className="large-task-row" key={task.id} type="button" onClick={() => openPatient(task.patientId)}>
              <div className="large-task-date">
                <CalendarDays size={19} aria-hidden="true" />
                <div>
                  <strong>{formatLongDate(task.date)}</strong>
                  <span>{task.time}</span>
                </div>
              </div>
              <div className="large-task-main">
                <span className={task.priority === "Vysoká" ? "task-status high" : "task-status"}>
                  {task.status}
                </span>
                <strong>{task.title}</strong>
                <span>{task.patient}</span>
              </div>
              <div className="task-assignee">
                <div className="avatar avatar-tiny">AD</div>
                <span>Onkogynekologický tým</span>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function AuditView({
  events,
  patients,
}: {
  events: RepositoryAuditEvent[];
  patients: Patient[];
}) {
  const patientNames = new Map(
    patients.map((patient) => [patient.id, `${patient.firstName} ${patient.lastName}`]),
  );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Bezpečnost a dohledatelnost</p>
        <h1>Auditní stopa</h1>
        <p>Neměnný přehled změn uložených v datové složce registru.</p>
      </div>

      <section className="panel audit-intro">
        <div className="audit-intro-icon">
          <ShieldCheck size={25} aria-hidden="true" />
        </div>
        <div>
          <h2>Každá práce se záznamem musí být dohledatelná</h2>
          <p>
            Každé vytvoření záznamu a každá uložená změna vytváří samostatný auditní
            soubor s časem, akcí, revizí a identifikátorem dotčeného pacienta.
          </p>
        </div>
      </section>

      <section className="panel audit-panel">
        <div className="panel-header">
          <div>
            <h2>Poslední aktivita</h2>
            <p>Nejnovější uložené změny jsou zobrazeny jako první.</p>
          </div>
        </div>
        <div className="audit-list">
          {events.length ? events.map((event) => {
            const occurredAt = new Date(event.timestamp);
            return (
            <div className="audit-row" key={event.id}>
              <div className="audit-action-icon change">
                <PencilLine size={17} aria-hidden="true" />
              </div>
              <div className="audit-time">
                <strong>{new Intl.DateTimeFormat("cs-CZ", { timeStyle: "short" }).format(occurredAt)}</strong>
                <span>{new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(occurredAt)}</span>
              </div>
              <div className="audit-main">
                <strong>{event.action}</strong>
                <span>{patientNames.get(event.patientId) ?? `Záznam ${event.patientId}`}</span>
              </div>
              <div className="audit-user">
                <span>{event.actor}</span>
                <small>{event.category} · revize {event.revision}</small>
              </div>
            </div>
            );
          }) : (
            <div className="empty-state compact-empty-state">
              <h3>Auditní stopa je zatím prázdná</h3>
              <p>První záznam vznikne při přijetí pacienta do péče.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function StageDetailModal({
  patient,
  stage,
  onClose,
  onSave,
}: {
  patient: Patient;
  stage: MajorStage;
  onClose: () => void;
  onSave: (patient: Patient, action: string) => Promise<void>;
}) {
  const [biopsyPerformed, setBiopsyPerformed] = useState(
    patient.biopsyStatus !== "Nutno provést",
  );
  const [biopsyOrigin, setBiopsyOrigin] = useState<"Provedena v ÚVN" | "Provedena externě">(
    patient.biopsyStatus === "Provedena externě" ? "Provedena externě" : "Provedena v ÚVN",
  );
  const [biopsyDate, setBiopsyDate] = useState(patient.biopsyResult?.date ?? "");
  const [biopsyFacility, setBiopsyFacility] = useState(patient.biopsyResult?.facility ?? "");
  const [biopsyReference, setBiopsyReference] = useState(
    patient.biopsyResult?.reportReference ?? "",
  );
  const [biopsyConclusion, setBiopsyConclusion] = useState(
    patient.biopsyResult?.conclusion ?? "",
  );
  const [stagingDetails, setStagingDetails] = useState<StagingExamination[]>(() =>
    getPatientStagingDetails(patient).map((examination) => ({
      ...examination,
      id: examination.id.startsWith("legacy-") ? crypto.randomUUID() : examination.id,
    })),
  );
  const [customExamination, setCustomExamination] = useState("");
  const [mdtDate, setMdtDate] = useState(patient.mdtDate ?? "");
  const [mdtConclusion, setMdtConclusion] = useState(patient.mdtConclusion ?? "");
  const [mdtDetails, setMdtDetails] = useState<MdtDetails>(() =>
    getInitialMdtDetails(patient),
  );
  const [treatmentRoute, setTreatmentRoute] = useState<TreatmentRoute | null>(
    patient.treatmentRoute,
  );
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSubmitting, onClose]);

  const toggleStagingExamination = (name: string) => {
    setStagingDetails((current) =>
      current.some((item) => item.name === name)
        ? current.filter((item) => item.name !== name)
        : [...current, { id: crypto.randomUUID(), name, date: "", result: "" }],
    );
  };

  const addCustomExamination = () => {
    const name = customExamination.trim();
    if (!name || stagingDetails.some((item) => item.name.toLocaleLowerCase("cs-CZ") === name.toLocaleLowerCase("cs-CZ"))) return;
    setStagingDetails((current) => [
      ...current,
      { id: crypto.randomUUID(), name, date: "", result: "" },
    ]);
    setCustomExamination("");
  };

  const updateStagingExamination = (
    id: string,
    field: "date" | "result",
    value: string,
  ) => {
    setStagingDetails((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const getExaminationStatus = (examination: StagingExamination) => {
    return getExaminationDisplayStatus(examination, todayIso());
  };

  const updateMdtDetail = <Field extends keyof MdtDetails>(
    field: Field,
    value: MdtDetails[Field],
  ) => {
    setMdtDetails((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let updatedPatient = patient;
    const action = `Aktualizována fáze ${stage}`;
    const eventDate = todayIso();

    if (stage === "Biopsie") {
      if ((biopsyPerformed || biopsyConclusion.trim()) && !biopsyDate) {
        setFormError("Doplňte datum biopsie.");
        return;
      }
      if (biopsyConclusion.trim() && !biopsyPerformed) {
        setFormError("U výsledku biopsie označte, že biopsie již byla provedena.");
        return;
      }
      if (biopsyOrigin === "Provedena externě" && biopsyPerformed && !biopsyFacility.trim()) {
        setFormError("Doplňte externí pracoviště.");
        return;
      }
      const resultAvailable = Boolean(biopsyConclusion.trim());
      const biopsyResult = biopsyDate
        ? {
            date: biopsyDate,
            facility:
              biopsyOrigin === "Provedena v ÚVN" ? "ÚVN Praha" : biopsyFacility.trim(),
            reportReference: biopsyReference.trim(),
            conclusion: biopsyConclusion.trim(),
          }
        : null;
      const mayAdvance = getPatientMajorStageIndex(patient) <= 1 && resultAvailable;
      updatedPatient = {
        ...patient,
        biopsyStatus: biopsyPerformed ? biopsyOrigin : "Nutno provést",
        biopsyResult,
        diagnosisCertainty: resultAvailable ? "Histologicky potvrzená" : patient.diagnosisCertainty,
        phase: mayAdvance ? "Staging" : patient.phase,
        progress: mayAdvance ? Math.max(patient.progress, 40) : patient.progress,
        nextStep:
          getPatientMajorStageIndex(patient) > 1
            ? patient.nextStep
            : resultAvailable
              ? "Vybrat stagingová vyšetření"
              : getBiopsyDisplayStatus({ ...patient, biopsyResult }),
        nextStepDate:
          getPatientMajorStageIndex(patient) > 1
            ? patient.nextStepDate
            : (biopsyDate || patient.nextStepDate),
        events: [
          {
            id: crypto.randomUUID(),
            kind: "pathology",
            date: eventDate,
            title: resultAvailable ? "Výsledek biopsie doplněn" : "Biopsie aktualizována",
            description: resultAvailable
              ? biopsyConclusion.trim()
              : biopsyDate
                ? `Termín biopsie: ${formatLongDate(biopsyDate)}.`
                : "Biopsie zatím nebyla naplánována.",
            author: SESSION_ACTOR,
            status: resultAvailable ? "Dokončeno" : "Naplánováno",
          },
          ...patient.events,
        ],
      };
    }

    if (stage === "Staging") {
      if (!stagingDetails.length) {
        setFormError("Vyberte alespoň jedno stagingové vyšetření.");
        return;
      }
      if (stagingDetails.some((item) => item.result.trim() && !item.date)) {
        setFormError("Každý zadaný výsledek musí mít datum vyšetření.");
        return;
      }
      const complete = stagingDetails.every((item) => item.date && item.result.trim());
      const mayAdvance = getPatientMajorStageIndex(patient) <= 2 && complete;
      updatedPatient = {
        ...patient,
        stagingDetails,
        stagingExaminations: stagingDetails.map((item) => item.name),
        phase: mayAdvance ? "MDT" : patient.phase,
        progress: mayAdvance ? Math.max(patient.progress, 65) : patient.progress,
        nextStep:
          getPatientMajorStageIndex(patient) > 2
            ? patient.nextStep
            : complete
              ? "Naplánovat MDT"
              : getStagingDisplayStatus({ ...patient, stagingDetails }),
        nextStepDate:
          getPatientMajorStageIndex(patient) > 2
            ? patient.nextStepDate
            : (stagingDetails.map((item) => item.date).filter(Boolean).sort()[0] ?? patient.nextStepDate),
        events: [
          {
            id: crypto.randomUUID(),
            kind: "imaging",
            date: eventDate,
            title: complete ? "Výsledky stagingu kompletní" : "Staging aktualizován",
            description: `${stagingDetails.length} vyšetření, ${stagingDetails.filter((item) => item.result.trim()).length} výsledků dokončeno.`,
            author: SESSION_ACTOR,
            status: complete ? "Dokončeno" : "Naplánováno",
          },
          ...patient.events,
        ],
      };
    }

    if (stage === "MDT") {
      if (!mdtDate) {
        setFormError("Doplňte datum MDT.");
        return;
      }
      if (
        mdtDetails.karnofsky.trim() &&
        (!/^\d{1,3}$/.test(mdtDetails.karnofsky.trim()) ||
          Number(mdtDetails.karnofsky) < 0 ||
          Number(mdtDetails.karnofsky) > 100)
      ) {
        setFormError("Karnofsky výkon musí být celé číslo od 0 do 100.");
        return;
      }
      if (
        mdtDetails.imagingIntervalMonths.trim() &&
        (!/^\d+$/.test(mdtDetails.imagingIntervalMonths.trim()) ||
          Number(mdtDetails.imagingIntervalMonths) > 120)
      ) {
        setFormError("Interval zobrazení zadejte jako počet měsíců od 0 do 120.");
        return;
      }
      if (mdtConclusion.trim() && !treatmentRoute) {
        setFormError("Po zadání závěru vyberte léčebnou strategii.");
        return;
      }
      const effectiveRoute = getPatientMajorStageIndex(patient) > 3
        ? patient.treatmentRoute
        : treatmentRoute;
      const complete = Boolean(mdtConclusion.trim() && effectiveRoute);
      const mayAdvance = getPatientMajorStageIndex(patient) <= 3 && complete;
      const routeNextStep: Record<TreatmentRoute, string> = {
        "Primární operace": "Naplánovat operační výkon",
        "Neoadjuvantní léčba": "Zahájit neoadjuvantní léčbu",
        Paliace: "Zahájit paliativní plán péče",
      };
      updatedPatient = {
        ...patient,
        mdtDate,
        mdtConclusion: mdtConclusion.trim(),
        mdtDetails: {
          ...mdtDetails,
          surgeryDiagnosis: mdtDetails.surgeryDiagnosis.trim(),
          operator: mdtDetails.operator.trim(),
          histologyType: mdtDetails.histologyType.trim(),
          histologyNumber: mdtDetails.histologyNumber.trim(),
          histologyGrade: mdtDetails.histologyGrade.trim(),
          recommendedImaging: mdtDetails.recommendedImaging.trim(),
          imagingIntervalMonths: mdtDetails.imagingIntervalMonths.trim(),
          imagingSite: mdtDetails.imagingSite.trim(),
          oncologist: mdtDetails.oncologist.trim(),
          nationalOncologyRegistry: mdtDetails.nationalOncologyRegistry.trim(),
          karnofsky: mdtDetails.karnofsky.trim(),
          attendees: mdtDetails.attendees.trim(),
        },
        treatmentRoute: effectiveRoute,
        phase: mayAdvance && effectiveRoute ? "Terapie" : patient.phase,
        progress: mayAdvance ? Math.max(patient.progress, 80) : patient.progress,
        nextStep:
          getPatientMajorStageIndex(patient) > 3
            ? patient.nextStep
            : complete && effectiveRoute
              ? routeNextStep[effectiveRoute]
              : getMdtDisplayStatus({ ...patient, mdtDate, mdtConclusion }),
        nextStepDate: getPatientMajorStageIndex(patient) > 3 ? patient.nextStepDate : mdtDate,
        events: [
          {
            id: crypto.randomUUID(),
            kind: "mdt",
            date: eventDate,
            title: complete ? `Rozhodnutí MDT — ${effectiveRoute}` : "MDT aktualizováno",
            description: mdtConclusion.trim() || `Termín MDT: ${formatLongDate(mdtDate)}.`,
            author: SESSION_ACTOR,
            status: complete ? "Dokončeno" : "Naplánováno",
          },
          ...patient.events,
        ],
      };
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      await onSave(updatedPatient, action);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Změnu se nepodařilo uložit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const readOnly = stage === "Příjem" || stage === "Terapie";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={isSubmitting ? undefined : onClose}>
      <section className="modal stage-detail-modal" role="dialog" aria-modal="true" aria-labelledby="stage-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{patient.firstName} {patient.lastName}</p>
            <h2 id="stage-detail-title">{stage}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít" onClick={onClose} disabled={isSubmitting}><X size={20} /></button>
        </div>

        {readOnly ? (
          <div className="stage-readonly-summary">
            {stage === "Příjem" ? (
              <>
                <strong>Přijetí {formatLongDate(patient.intakeDate)}</strong>
                <span>{patient.primaryDiagnosisCode} — {patient.primaryDiagnosisLabel}</span>
                <span>Odpovědný pracovník: {patient.physician}</span>
              </>
            ) : (
              <>
                <strong>{patient.treatmentRoute ?? "Léčebná strategie zatím není určena"}</strong>
                <span>{patient.mdtConclusion || "Závěr MDT zatím není uložen."}</span>
              </>
            )}
            <button className="button button-secondary" type="button" onClick={onClose}>Zavřít</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {stage === "Biopsie" ? (
              <div className="form-section stage-form-section">
                <div className="stage-live-status"><strong>{getBiopsyDisplayStatus({ ...patient, biopsyResult: biopsyDate ? { date: biopsyDate, facility: biopsyFacility, reportReference: biopsyReference, conclusion: biopsyConclusion } : null })}</strong></div>
                <fieldset className="biopsy-choice full-column">
                  <legend>Byla biopsie již provedena?</legend>
                  <div className="biopsy-choice-grid two-options">
                    <label className={`biopsy-option ${biopsyPerformed ? "selected" : ""}`}><input type="radio" checked={biopsyPerformed} onChange={() => setBiopsyPerformed(true)} /><span><strong>Ano</strong><small>Doplnit datum a případně výsledek</small></span></label>
                    <label className={`biopsy-option ${!biopsyPerformed ? "selected" : ""}`}><input type="radio" checked={!biopsyPerformed} onChange={() => { setBiopsyPerformed(false); setBiopsyConclusion(""); }} /><span><strong>Ne</strong><small>Naplánovat termín biopsie</small></span></label>
                  </div>
                </fieldset>
                {biopsyPerformed ? (
                  <label className="form-field"><span>Původ biopsie</span><select value={biopsyOrigin} onChange={(event) => setBiopsyOrigin(event.target.value as typeof biopsyOrigin)}><option>Provedena v ÚVN</option><option>Provedena externě</option></select></label>
                ) : null}
                <div className="form-grid two-columns">
                  <label className="form-field"><span>{biopsyPerformed ? "Datum provedení" : "Plánované datum"}</span><input type="date" value={biopsyDate} onChange={(event) => setBiopsyDate(event.target.value)} /></label>
                  {biopsyPerformed && biopsyOrigin === "Provedena externě" ? <label className="form-field"><span>Pracoviště</span><input value={biopsyFacility} onChange={(event) => setBiopsyFacility(event.target.value)} /></label> : null}
                  <label className="form-field full-column"><span>Reference nálezu</span><input value={biopsyReference} onChange={(event) => setBiopsyReference(event.target.value)} /></label>
                  <label className="form-field full-column"><span>Výsledek biopsie</span><textarea rows={5} value={biopsyConclusion} onChange={(event) => setBiopsyConclusion(event.target.value)} placeholder="Výsledek lze doplnit i později…" /></label>
                </div>
              </div>
            ) : null}

            {stage === "Staging" ? (
              <div className="form-section stage-form-section">
                <div className="stage-live-status">
                  <strong>{getStagingDisplayStatus({ ...patient, stagingDetails })}</strong>
                </div>

                <fieldset className="staging-picker">
                  <legend>Přidat požadované vyšetření</legend>
                  <div className="staging-picker-grid">
                    {standardStagingExaminations.map((name) => {
                      const selected = stagingDetails.some((item) => item.name === name);
                      return (
                        <label
                          className={`staging-picker-option ${selected ? "selected" : ""}`}
                          key={name}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStagingExamination(name)}
                          />
                          <span>{name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="staging-add-row">
                    <input
                      value={customExamination}
                      onChange={(event) => setCustomExamination(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomExamination();
                        }
                      }}
                      placeholder="Další stagingové vyšetření nebo onkomarker…"
                    />
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={addCustomExamination}
                    >
                      <Plus size={16} aria-hidden="true" /> Přidat
                    </button>
                  </div>
                </fieldset>

                {stagingDetails.length ? (
                  <div className="staging-examination-table">
                    <div className="staging-examination-table-head" aria-hidden="true">
                      <span>Vyšetření</span>
                      <span>Datum</span>
                      <span>Závěr</span>
                      <span>Stav</span>
                      <span />
                    </div>
                    {stagingDetails.map((examination) => (
                      <article className="staging-examination-row" key={examination.id}>
                        <strong className="staging-examination-name">{examination.name}</strong>
                        <label className="form-field staging-date-field">
                          <span>Datum vyšetření</span>
                          <input
                            type="date"
                            value={examination.date}
                            onChange={(event) =>
                              updateStagingExamination(examination.id, "date", event.target.value)
                            }
                          />
                        </label>
                        <label className="form-field staging-conclusion-field">
                          <span>Závěr vyšetření</span>
                          <textarea
                            rows={2}
                            value={examination.result}
                            onChange={(event) =>
                              updateStagingExamination(examination.id, "result", event.target.value)
                            }
                            placeholder="Závěr lze doplnit později…"
                          />
                        </label>
                        <span className="staging-row-status">
                          {getExaminationStatus(examination)}
                        </span>
                        <button
                          className="staging-remove-button"
                          type="button"
                          aria-label={`Odebrat ${examination.name}`}
                          onClick={() => toggleStagingExamination(examination.name)}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="staging-empty-selection">
                    Vyberte alespoň jedno vyšetření nebo onkomarker.
                  </div>
                )}
              </div>
            ) : null}

            {stage === "MDT" ? (
              <div className="form-section stage-form-section mdt-form">
                <div className="stage-live-status">
                  <strong>{getMdtDisplayStatus({ ...patient, mdtDate, mdtConclusion })}</strong>
                </div>

                <section className="mdt-form-block">
                  <div className="mdt-form-heading">
                    <strong>Podklady k MDT</strong>
                    <span>Souhrn biopsie, stagingu, onkomarkerů a jejich závěrů</span>
                  </div>
                  <div className="mdt-evidence-list">
                    {patient.biopsyResult ? (
                      <article className="mdt-evidence-row">
                        <div>
                          <strong>Biopsie / histologie</strong>
                          <span>{patient.biopsyResult.facility}</span>
                        </div>
                        <time dateTime={patient.biopsyResult.date}>
                          {formatLongDate(patient.biopsyResult.date)}
                        </time>
                        <p>
                          {patient.biopsyResult.conclusion ||
                            "Histologický závěr zatím není k dispozici."}
                        </p>
                        <span className="mdt-evidence-status">
                          {getBiopsyDisplayStatus(patient)}
                        </span>
                      </article>
                    ) : null}
                    {stagingDetails.map((examination) => (
                      <article className="mdt-evidence-row" key={examination.id}>
                        <div>
                          <strong>{examination.name}</strong>
                          <span>Staging / laboratorní podklad</span>
                        </div>
                        <time dateTime={examination.date || undefined}>
                          {examination.date
                            ? formatLongDate(examination.date)
                            : "Termín nezadán"}
                        </time>
                        <p>{examination.result || "Závěr zatím není zadán."}</p>
                        <span className="mdt-evidence-status">
                          {getExaminationStatus(examination)}
                        </span>
                      </article>
                    ))}
                    {!patient.biopsyResult && !stagingDetails.length ? (
                      <div className="mdt-evidence-empty">
                        Nejsou uložené žádné diagnostické ani stagingové podklady.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="mdt-form-block">
                  <div className="mdt-form-heading">
                    <strong>Osobní údaje</strong>
                  </div>
                  <div className="mdt-patient-summary">
                    <div><span>Jméno</span><strong>{patient.firstName} {patient.lastName}</strong></div>
                    <div><span>Rodné číslo</span><strong>{patient.birthNumber}</strong></div>
                    <div><span>Věk</span><strong>{calculateAge(patient.dateOfBirth)} let</strong></div>
                    <div><span>MKN diagnóza</span><strong>{patient.primaryDiagnosisCode}</strong></div>
                    <div className="wide"><span>Diagnóza</span><strong>{patient.primaryDiagnosisLabel}</strong></div>
                    <label className="form-field"><span>Datum MDT *</span><input type="date" value={mdtDate} onChange={(event) => setMdtDate(event.target.value)} /></label>
                  </div>
                </section>

                <section className="mdt-form-block">
                  <div className="mdt-form-heading">
                    <strong>Operace</strong>
                  </div>
                  <div className="form-grid two-columns">
                    <label className="form-field"><span>Operace provedena</span><select value={mdtDetails.surgeryPerformed} onChange={(event) => updateMdtDetail("surgeryPerformed", event.target.value as MdtDetails["surgeryPerformed"])}><option value="">Nevybráno</option><option value="Ano">Ano</option><option value="Ne">Ne</option></select></label>
                    <label className="form-field"><span>Datum operace</span><input type="date" value={mdtDetails.surgeryDate} onChange={(event) => updateMdtDetail("surgeryDate", event.target.value)} /></label>
                    <label className="form-field"><span>Operační diagnóza</span><input value={mdtDetails.surgeryDiagnosis} onChange={(event) => updateMdtDetail("surgeryDiagnosis", event.target.value)} /></label>
                    <label className="form-field"><span>Operatér</span><input value={mdtDetails.operator} onChange={(event) => updateMdtDetail("operator", event.target.value)} placeholder="MUDr. …" /></label>
                  </div>
                </section>

                <section className="mdt-form-block">
                  <div className="mdt-form-heading">
                    <strong>Histologie</strong>
                  </div>
                  <div className="form-grid mdt-histology-grid">
                    <label className="form-field"><span>Histologický typ</span><input value={mdtDetails.histologyType} onChange={(event) => updateMdtDetail("histologyType", event.target.value)} /></label>
                    <label className="form-field"><span>Číslo histologie</span><input value={mdtDetails.histologyNumber} onChange={(event) => updateMdtDetail("histologyNumber", event.target.value)} /></label>
                    <label className="form-field"><span>Grade</span><input value={mdtDetails.histologyGrade} onChange={(event) => updateMdtDetail("histologyGrade", event.target.value)} placeholder="např. G2" /></label>
                  </div>
                </section>

                <section className="mdt-form-block">
                  <div className="mdt-form-heading">
                    <strong>Závěr MDT</strong>
                  </div>
                  <div className="form-grid two-columns">
                    <label className="form-field"><span>Doporučené zobrazení / vyšetření</span><input value={mdtDetails.recommendedImaging} onChange={(event) => updateMdtDetail("recommendedImaging", event.target.value)} placeholder="např. MR, PET/CT" /></label>
                    <label className="form-field"><span>Za kolik měsíců</span><input inputMode="numeric" value={mdtDetails.imagingIntervalMonths} onChange={(event) => updateMdtDetail("imagingIntervalMonths", event.target.value)} /></label>
                    <label className="form-field"><span>Termín zobrazení</span><input type="date" value={mdtDetails.imagingDate} onChange={(event) => updateMdtDetail("imagingDate", event.target.value)} /></label>
                    <label className="form-field"><span>Pracoviště zobrazení</span><input value={mdtDetails.imagingSite} onChange={(event) => updateMdtDetail("imagingSite", event.target.value)} placeholder="např. ÚVN" /></label>
                    <label className="form-field"><span>Termín kontroly</span><input type="date" value={mdtDetails.checkupDate} onChange={(event) => updateMdtDetail("checkupDate", event.target.value)} /></label>
                    <label className="form-field"><span>Onkolog</span><input value={mdtDetails.oncologist} onChange={(event) => updateMdtDetail("oncologist", event.target.value)} /></label>
                    <label className="form-field"><span>NOR</span><input value={mdtDetails.nationalOncologyRegistry} onChange={(event) => updateMdtDetail("nationalOncologyRegistry", event.target.value)} placeholder="Národní onkologický registr" /></label>
                    <label className="form-field"><span>Karnofsky výkon</span><input inputMode="numeric" value={mdtDetails.karnofsky} onChange={(event) => updateMdtDetail("karnofsky", event.target.value)} placeholder="0–100" /></label>
                    <label className="form-field full-column"><span>Doporučení / závěr MDT</span><textarea rows={5} value={mdtConclusion} onChange={(event) => setMdtConclusion(event.target.value)} placeholder="Závěr lze doplnit po jednání MDT…" /></label>
                    <label className="form-field full-column"><span>Přítomní</span><textarea rows={3} value={mdtDetails.attendees} onChange={(event) => updateMdtDetail("attendees", event.target.value)} placeholder="Členové multidisciplinárního týmu…" /></label>
                  </div>
                </section>

                <fieldset className="route-choice">
                  <legend>Léčebná strategie</legend>
                  <div className="route-choice-grid">{treatmentRoutes.map((route) => <label className={`route-choice-option ${treatmentRoute === route.label ? "selected" : ""}`} key={route.code}><input type="radio" name="stage-route" checked={treatmentRoute === route.label} onChange={() => setTreatmentRoute(route.label)} disabled={getPatientMajorStageIndex(patient) > 3} /><span className="route-code">{route.code}</span><span className="route-choice-copy"><strong>{route.label}</strong><small>{route.sites}</small>{route.next ? <em>{route.next}</em> : null}</span></label>)}</div>
                </fieldset>
              </div>
            ) : null}

            {formError ? <div className="form-error" role="alert"><AlertTriangle size={17} />{formError}</div> : null}
            <div className="modal-footer"><button className="button button-secondary" type="button" onClick={onClose} disabled={isSubmitting}>Zrušit</button><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <FileCheck2 size={17} />}{isSubmitting ? "Ukládám…" : "Uložit"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

function NewPatientModal({
  currentUser,
  onClose,
  onCreate,
}: {
  currentUser: string;
  onClose: () => void;
  onCreate: (patient: Patient) => Promise<void>;
}) {
  const [birthNumber, setBirthNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [intakeDate, setIntakeDate] = useState(todayIso);
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("C54.1");
  const [certainty, setCertainty] = useState<Patient["diagnosisCertainty"]>("Suspektní");
  const [biopsyStatus, setBiopsyStatus] = useState<BiopsyStatus>("Nutno provést");
  const [biopsyDate, setBiopsyDate] = useState("");
  const [biopsyFacility, setBiopsyFacility] = useState("");
  const [biopsyReference, setBiopsyReference] = useState("");
  const [biopsyConclusion, setBiopsyConclusion] = useState("");
  const [secondaryDiagnoses, setSecondaryDiagnoses] = useState<string[]>([]);
  const [secondarySelection, setSecondarySelection] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const birthNumberResult = useMemo(() => parseBirthNumber(birthNumber), [birthNumber]);
  const selectedDiagnosis =
    diagnoses.find((diagnosis) => diagnosis.code === primaryDiagnosis) ?? diagnoses[0];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const addSecondaryDiagnosis = () => {
    if (!secondarySelection || secondaryDiagnoses.includes(secondarySelection)) return;
    setSecondaryDiagnoses((current) => [...current, secondarySelection]);
    setSecondarySelection("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!birthNumberResult.date || birthNumberResult.error) {
      setFormError("Zkontrolujte rodné číslo a odvozené datum narození.");
      return;
    }
    if (birthNumberResult.checksumValid === false) {
      setFormError("Kontrolní součet rodného čísla neodpovídá. Zkontrolujte zadané číslo.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("Vyplňte jméno a příjmení.");
      return;
    }
    const biopsyAlreadyCompleted = biopsyStatus !== "Nutno provést";
    if (
      biopsyAlreadyCompleted &&
      (!biopsyDate ||
        !biopsyConclusion.trim() ||
        (biopsyStatus === "Provedena externě" && !biopsyFacility.trim()))
    ) {
      setFormError(
        "U provedené biopsie vyplňte datum, pracoviště a závěr histologického nálezu.",
      );
      return;
    }

    const id = crypto.randomUUID();
    const biopsyResult: Patient["biopsyResult"] = biopsyAlreadyCompleted
      ? {
          date: biopsyDate,
          facility: biopsyStatus === "Provedena v ÚVN" ? "ÚVN Praha" : biopsyFacility.trim(),
          reportReference: biopsyReference.trim(),
          conclusion: biopsyConclusion.trim(),
        }
      : null;
    const intakeEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      kind: "intake",
      date: intakeDate,
      title: "Přijetí pacienta do péče",
      description: `Hlavní diagnóza ${selectedDiagnosis.code} – ${selectedDiagnosis.label}.`,
      author: currentUser,
      status: "Dokončeno",
    };
    const events: TimelineEvent[] = biopsyAlreadyCompleted
      ? [
          {
            id: crypto.randomUUID(),
            kind: "pathology",
            date: biopsyResult?.date ?? intakeDate,
            title:
              biopsyStatus === "Provedena externě"
                ? "Externí biopsie doložena při příjmu"
                : "Biopsie z ÚVN doložena při příjmu",
            description: biopsyResult
              ? `${biopsyResult.facility}: ${biopsyResult.conclusion}${
                  biopsyResult.reportReference
                    ? ` Reference nálezu: ${biopsyResult.reportReference}.`
                    : ""
                } Druhá biopsie se neplánuje; další krok je staging.`
              : `${biopsyStatus}. Druhá biopsie se neplánuje; další krok je staging.`,
            author: currentUser,
            status: "Dokončeno",
          },
          intakeEvent,
        ]
      : [intakeEvent];

    const patient: Patient = {
      id,
      initials: `${firstName.trim()[0]}${lastName.trim()[0]}`.toLocaleUpperCase("cs-CZ"),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthNumber: formatBirthNumber(birthNumber),
      dateOfBirth: birthNumberResult.date,
      primaryDiagnosisCode: selectedDiagnosis.code,
      primaryDiagnosisLabel: selectedDiagnosis.label,
      secondaryDiagnoses,
      diagnosisCertainty: certainty,
      intakeDate,
      biopsyStatus,
      biopsyResult,
      stagingExaminations: [],
      stagingDetails: [],
      mdtDate: null,
      mdtConclusion: "",
      treatmentRoute: null,
      treatmentSite: null,
      recurrence: false,
      phase: biopsyAlreadyCompleted ? "Staging" : "Biopsie",
      progress: biopsyAlreadyCompleted ? 40 : 20,
      physician: currentUser,
      nextStep: biopsyAlreadyCompleted ? "Naplánovat staging" : "Naplánovat biopsii",
      nextStepDate: addDaysIso(intakeDate, 7),
      priority: "Běžná",
      events,
    };
    setIsSubmitting(true);
    setFormError("");
    try {
      await onCreate(patient);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Záznam se nepodařilo uložit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Nová onkologická epizoda</p>
            <h2 id="new-patient-title">Přijetí pacienta do péče</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-section">
            <div className="form-section-heading">
              <span>1</span>
              <div>
                <h3>Identifikace pacienta</h3>
                <p>Datum narození se odvodí z rodného čísla.</p>
              </div>
            </div>
            <div className="form-grid two-columns">
              <label className="form-field">
                <span>Rodné číslo *</span>
                <input
                  value={birthNumber}
                  onChange={(event) => setBirthNumber(event.target.value)}
                  placeholder="RRMMDD/XXXX"
                  inputMode="numeric"
                  autoFocus
                />
                {birthNumberResult.error && <small className="field-error">{birthNumberResult.error}</small>}
                {!birthNumberResult.error && birthNumberResult.checksumValid === false && (
                  <small className="field-warning">
                    Kontrolní součet neodpovídá. Záznam nebude možné uložit.
                  </small>
                )}
              </label>
              <label className="form-field">
                <span>Datum narození</span>
                <div className={`derived-field ${birthNumberResult.date ? "has-value" : ""}`}>
                  <CalendarDays size={17} aria-hidden="true" />
                  {birthNumberResult.date ? formatLongDate(birthNumberResult.date) : "Doplní se automaticky"}
                </div>
              </label>
              <label className="form-field">
                <span>Jméno *</span>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Jméno" />
              </label>
              <label className="form-field">
                <span>Příjmení *</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Příjmení" />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>2</span>
              <div>
                <h3>Přijetí a diagnóza</h3>
                <p>Jedna hlavní a volitelné vedlejší diagnózy.</p>
              </div>
            </div>
            <div className="form-grid two-columns">
              <label className="form-field">
                <span>Datum přijetí *</span>
                <input type="date" value={intakeDate} onChange={(event) => setIntakeDate(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Stav diagnózy</span>
                <select value={certainty} onChange={(event) => setCertainty(event.target.value as Patient["diagnosisCertainty"])}>
                  <option>Suspektní</option>
                  <option>Předběžně potvrzená</option>
                  <option>Histologicky potvrzená</option>
                </select>
              </label>
              <label className="form-field full-column">
                <span>Hlavní diagnóza MKN-10 *</span>
                <select value={primaryDiagnosis} onChange={(event) => setPrimaryDiagnosis(event.target.value)}>
                  {diagnoses.map((diagnosis) => (
                    <option key={diagnosis.code} value={diagnosis.code}>
                      {diagnosis.code} — {diagnosis.label}
                    </option>
                  ))}
                </select>
                <small>Výběr obsahuje nejčastější onkogynekologické diagnózy.</small>
              </label>
              <div className="form-field full-column">
                <span>Vedlejší diagnózy</span>
                <div className="secondary-diagnosis-add">
                  <select value={secondarySelection} onChange={(event) => setSecondarySelection(event.target.value)}>
                    <option value="">Vyberte další diagnózu…</option>
                    {diagnoses
                      .filter((diagnosis) => diagnosis.code !== primaryDiagnosis)
                      .map((diagnosis) => (
                        <option key={diagnosis.code} value={diagnosis.code}>
                          {diagnosis.code} — {diagnosis.label}
                        </option>
                      ))}
                  </select>
                  <button className="button button-secondary" type="button" onClick={addSecondaryDiagnosis}>
                    Přidat
                  </button>
                </div>
                {secondaryDiagnoses.length > 0 && (
                  <div className="diagnosis-tags">
                    {secondaryDiagnoses.map((code) => (
                      <span key={code}>
                        {code}
                        <button
                          type="button"
                          aria-label={`Odebrat diagnózu ${code}`}
                          onClick={() => setSecondaryDiagnoses((current) => current.filter((item) => item !== code))}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <fieldset className="biopsy-choice full-column">
                <legend>Stav biopsie při přijetí</legend>
                <p>
                  Doložená biopsie se neopakuje. Pacient je zařazen přímo do stagingu a
                  původ materiálu zůstává evidován.
                </p>
                <div className="biopsy-choice-grid">
                  {(
                    [
                      {
                        value: "Nutno provést",
                        title: "Biopsie dosud není",
                        description: "Další krok: provést biopsii",
                      },
                      {
                        value: "Provedena v ÚVN",
                        title: "Provedena v ÚVN",
                        description: "Doplnit výsledek a pokračovat do stagingu",
                      },
                      {
                        value: "Provedena externě",
                        title: "Provedena externě",
                        description: "Přeskočit druhou biopsii",
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      className={`biopsy-option ${biopsyStatus === option.value ? "selected" : ""}`}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="biopsy-status"
                        value={option.value}
                        checked={biopsyStatus === option.value}
                        onChange={() => setBiopsyStatus(option.value)}
                      />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {biopsyStatus !== "Nutno provést" ? (
                  <div className="external-biopsy-fields" aria-live="polite">
                    <div className="external-biopsy-heading">
                      <div>
                        <strong>
                          {biopsyStatus === "Provedena v ÚVN"
                            ? "Výsledek biopsie z ÚVN"
                            : "Výsledek externí biopsie"}
                        </strong>
                        <small>
                          Zapište údaje z histologického nálezu. Reference je volitelná.
                        </small>
                      </div>
                      <Microscope size={19} aria-hidden="true" />
                    </div>
                    <div className="form-grid two-columns">
                      <label className="form-field">
                        <span>Datum odběru / výkonu *</span>
                        <input
                          type="date"
                          value={biopsyDate}
                          onChange={(event) => setBiopsyDate(event.target.value)}
                          required
                        />
                      </label>
                      <label className="form-field">
                        <span>Pracoviště *</span>
                        <input
                          value={
                            biopsyStatus === "Provedena v ÚVN"
                              ? "ÚVN Praha"
                              : biopsyFacility
                          }
                          onChange={(event) => setBiopsyFacility(event.target.value)}
                          placeholder="Název externího pracoviště"
                          readOnly={biopsyStatus === "Provedena v ÚVN"}
                          required
                        />
                      </label>
                      <label className="form-field full-column">
                        <span>Reference nálezu</span>
                        <input
                          value={biopsyReference}
                          onChange={(event) => setBiopsyReference(event.target.value)}
                          placeholder="Číslo biopsie / histologického nálezu"
                        />
                      </label>
                      <label className="form-field full-column">
                        <span>Závěr histologického nálezu *</span>
                        <textarea
                          value={biopsyConclusion}
                          onChange={(event) => setBiopsyConclusion(event.target.value)}
                          rows={4}
                          placeholder="Stručný závěr histologického nálezu…"
                          required
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </fieldset>
            </div>
          </div>

          {formError && (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              {formError}
            </div>
          )}

          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Zrušit
            </button>
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <FileCheck2 size={18} aria-hidden="true" />}
              {isSubmitting ? "Ukládám…" : "Přijmout do péče"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdvancePatientModal({
  patient,
  onClose,
  onAdvance,
}: {
  patient: Patient;
  onClose: () => void;
  onAdvance: (input: WorkflowAdvanceInput) => Promise<void>;
}) {
  const action = getWorkflowAdvanceAction(patient);
  const dialogRef = useRef<HTMLElement>(null);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [biopsyStatus, setBiopsyStatus] = useState<CompletedBiopsyStatus | null>(() =>
    patient.biopsyStatus === "Nutno provést" ? null : patient.biopsyStatus,
  );
  const [biopsyDate, setBiopsyDate] = useState(
    patient.biopsyResult?.date ?? todayIso(),
  );
  const [biopsyFacility, setBiopsyFacility] = useState(
    patient.biopsyResult?.facility ?? "",
  );
  const [biopsyReference, setBiopsyReference] = useState(
    patient.biopsyResult?.reportReference ?? "",
  );
  const [biopsyConclusion, setBiopsyConclusion] = useState(
    patient.biopsyResult?.conclusion ?? "",
  );
  const [stagingChoices, setStagingChoices] = useState<string[]>(() =>
    Array.from(
      new Set([...standardStagingExaminations, ...patient.stagingExaminations]),
    ),
  );
  const [selectedStagingExaminations, setSelectedStagingExaminations] = useState<string[]>(
    patient.stagingExaminations,
  );
  const [customStagingExamination, setCustomStagingExamination] = useState("");
  const [treatmentRoute, setTreatmentRoute] = useState<TreatmentRoute | null>(null);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  if (!action) return null;

  const targetLabel = action.targetLabel;
  const isBiopsyProcedure = patient.phase === "Biopsie";
  const isWaitingForBiopsyResult = patient.phase === "Čekání na výsledek biopsie";
  const isBiopsyWorkflow = isBiopsyProcedure || isWaitingForBiopsyResult;

  const toggleStagingExamination = (examination: string) => {
    setSelectedStagingExaminations((current) =>
      current.includes(examination)
        ? current.filter((item) => item !== examination)
        : [...current, examination],
    );
    setFormError("");
  };

  const addCustomStagingExamination = () => {
    const trimmed = customStagingExamination.trim();
    if (!trimmed) return;
    const existing = stagingChoices.find(
      (item) => item.localeCompare(trimmed, "cs", { sensitivity: "base" }) === 0,
    );
    const examination = existing ?? trimmed;
    if (!existing) setStagingChoices((current) => [...current, examination]);
    setSelectedStagingExaminations((current) =>
      current.includes(examination) ? current : [...current, examination],
    );
    setCustomStagingExamination("");
    setFormError("");
  };

  const removeCustomStagingExamination = (examination: string) => {
    setStagingChoices((current) => current.filter((item) => item !== examination));
    setSelectedStagingExaminations((current) =>
      current.filter((item) => item !== examination),
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!date) {
      setFormError("Doplňte datum dokončení aktuální fáze.");
      return;
    }
    if (isBiopsyWorkflow && !biopsyStatus) {
      setFormError("Vyberte, kde byla biopsie provedena.");
      return;
    }
    if (
      isBiopsyWorkflow &&
      biopsyStatus &&
      (!biopsyDate ||
        (biopsyStatus === "Provedena externě" && !biopsyFacility.trim()))
    ) {
      setFormError("U provedené biopsie vyplňte datum a pracoviště.");
      return;
    }
    if (isWaitingForBiopsyResult && !biopsyConclusion.trim()) {
      setFormError("Doplňte závěr histologického nálezu.");
      return;
    }
    if (patient.phase === "Staging" && selectedStagingExaminations.length === 0) {
      setFormError("Vyberte alespoň jedno dokončené stagingové vyšetření.");
      return;
    }
    if (patient.phase === "MDT" && !treatmentRoute) {
      setFormError("Vyberte léčebnou větev doporučenou MDT.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      await onAdvance({
        date,
        note,
        biopsyStatus,
        biopsyResult:
          isBiopsyWorkflow && biopsyStatus
            ? {
                date: biopsyDate,
                facility:
                  biopsyStatus === "Provedena v ÚVN"
                    ? "ÚVN Praha"
                    : biopsyFacility.trim(),
                reportReference: biopsyReference.trim(),
                conclusion: isWaitingForBiopsyResult ? biopsyConclusion.trim() : "",
              }
            : null,
        stagingExaminations: selectedStagingExaminations,
        treatmentRoute,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Změnu se nepodařilo uložit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal modal-small advance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advance-patient-title"
        aria-describedby="advance-patient-description"
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {patient.firstName} {patient.lastName}
            </p>
            <h2 id="advance-patient-title">Posunout v procesu</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="advance-summary" id="advance-patient-description">
            <div className="advance-summary-step">
              <span>Aktuální fáze</span>
              <PhaseBadge phase={patient.phase} treatmentRoute={patient.treatmentRoute} />
            </div>
            <span className="advance-summary-arrow" aria-hidden="true">
              <ArrowRight size={20} />
            </span>
            <div className="advance-summary-step advance-summary-target" aria-live="polite">
              <span>Po potvrzení</span>
              <strong>{targetLabel}</strong>
            </div>
          </div>
          <p className="advance-description">{action.description}</p>

          {isBiopsyWorkflow ? (
            <fieldset className="biopsy-choice advance-choice">
              <legend>
                {isBiopsyProcedure ? "Provedená biopsie *" : "Histologický výsledek *"}
              </legend>
              <p>
                {isBiopsyProcedure
                  ? "Zaznamenejte výkon. Pacient se přesune do čekání na histologický výsledek."
                  : "Doplňte obdržený histologický závěr a pokračujte do stagingu."}
              </p>
              <div className="biopsy-choice-grid two-options">
                {(
                  [
                    {
                      value: "Provedena v ÚVN",
                      title: "Provedena v ÚVN",
                      description: "Doplnit výsledek z místního pracoviště",
                    },
                    {
                      value: "Provedena externě",
                      title: "Provedena externě",
                      description: "Doložit externí histologický nález",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    className={`biopsy-option ${biopsyStatus === option.value ? "selected" : ""}`}
                    key={option.value}
                  >
                    <input
                      type="radio"
                      name="advance-biopsy-status"
                      value={option.value}
                      checked={biopsyStatus === option.value}
                      onChange={() => {
                        setBiopsyStatus(option.value);
                        setFormError("");
                      }}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>

              {biopsyStatus ? (
                <div className="external-biopsy-fields" aria-live="polite">
                  <div className="external-biopsy-heading">
                    <div>
                      <strong>
                        {isBiopsyProcedure
                          ? "Údaje o provedené biopsii"
                          : biopsyStatus === "Provedena v ÚVN"
                            ? "Výsledek biopsie z ÚVN"
                            : "Výsledek externí biopsie"}
                      </strong>
                      <small>
                        {isBiopsyProcedure
                          ? "Histologický závěr doplníte po obdržení výsledku."
                          : "Reference nálezu je volitelná."}
                      </small>
                    </div>
                    <Microscope size={19} aria-hidden="true" />
                  </div>
                  <div className="form-grid two-columns">
                    <label className="form-field">
                      <span>Datum odběru / výkonu *</span>
                      <input
                        type="date"
                        value={biopsyDate}
                        onChange={(event) => setBiopsyDate(event.target.value)}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Pracoviště *</span>
                      <input
                        value={
                          biopsyStatus === "Provedena v ÚVN"
                            ? "ÚVN Praha"
                            : biopsyFacility
                        }
                        onChange={(event) => setBiopsyFacility(event.target.value)}
                        placeholder="Název externího pracoviště"
                        readOnly={biopsyStatus === "Provedena v ÚVN"}
                        required
                      />
                    </label>
                    <label className="form-field full-column">
                      <span>Reference nálezu</span>
                      <input
                        value={biopsyReference}
                        onChange={(event) => setBiopsyReference(event.target.value)}
                        placeholder="Číslo biopsie / histologického nálezu"
                      />
                    </label>
                    {isWaitingForBiopsyResult ? (
                      <label className="form-field full-column">
                        <span>Závěr histologického nálezu *</span>
                        <textarea
                          value={biopsyConclusion}
                          onChange={(event) => setBiopsyConclusion(event.target.value)}
                          rows={4}
                          placeholder="Stručný závěr histologického nálezu…"
                          required
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          {patient.phase === "Staging" ? (
            <fieldset className="staging-choice advance-choice">
              <legend>Dokončená stagingová vyšetření *</legend>
              <p>
                Vyberte všechna relevantní vyšetření. Další položku můžete přidat ručně.
              </p>
              <div className="staging-checklist">
                {stagingChoices.map((examination) => {
                  const selected = selectedStagingExaminations.includes(examination);
                  const custom = !standardStagingExaminations.some(
                    (standard) => standard === examination,
                  );
                  return (
                    <div
                      className={`staging-option ${selected ? "selected" : ""}`}
                      key={examination}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleStagingExamination(examination)}
                        />
                        <span>{examination}</span>
                      </label>
                      {custom ? (
                        <button
                          type="button"
                          aria-label={`Odebrat vlastní vyšetření ${examination}`}
                          onClick={() => removeCustomStagingExamination(examination)}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="staging-add-row">
                <label className="sr-only" htmlFor="custom-staging-examination">
                  Přidat vlastní stagingové vyšetření
                </label>
                <input
                  id="custom-staging-examination"
                  value={customStagingExamination}
                  onChange={(event) => setCustomStagingExamination(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomStagingExamination();
                    }
                  }}
                  placeholder="Další vyšetření…"
                />
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={addCustomStagingExamination}
                >
                  <Plus size={16} aria-hidden="true" />
                  Přidat
                </button>
              </div>
              <small className="staging-selection-count">
                Vybráno: {selectedStagingExaminations.length}
              </small>
            </fieldset>
          ) : null}

          {patient.phase === "MDT" ? (
            <fieldset className="route-choice advance-choice">
              <legend>Léčebná strategie doporučená MDT *</legend>
              <p>Volba nastaví modifikátor fáze Terapie a nejbližší klinický krok.</p>
              <div className="route-choice-grid">
                {treatmentRoutes.map((route) => (
                  <label
                    className={`route-choice-option ${
                      treatmentRoute === route.label ? "selected" : ""
                    }`}
                    key={route.code}
                  >
                    <input
                      type="radio"
                      name="treatment-route"
                      value={route.label}
                      checked={treatmentRoute === route.label}
                      onChange={() => {
                        setTreatmentRoute(route.label);
                        setFormError("");
                      }}
                    />
                    <span className="route-code">{route.code}</span>
                    <span className="route-choice-copy">
                      <strong>{route.label}</strong>
                      <small>{route.sites}</small>
                      {route.next ? <em>{route.next}</em> : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="form-grid two-columns compact-form advance-details">
            <label className="form-field">
              <span>Datum dokončení fáze *</span>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setFormError("");
                }}
                required
                autoFocus={
                  patient.phase !== "Biopsie" &&
                  patient.phase !== "Čekání na výsledek biopsie" &&
                  patient.phase !== "Staging" &&
                  patient.phase !== "MDT"
                }
              />
            </label>
            <div className="advance-audit-note">
              <History size={18} aria-hidden="true" />
              <span>Posun se automaticky zapíše do časové osy.</span>
            </div>
            <label className="form-field full-column">
              <span>Poznámka</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Volitelné upřesnění rozhodnutí nebo výsledku…"
              />
            </label>
          </div>

          {formError ? (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              {formError}
            </div>
          ) : null}

          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Zrušit
            </button>
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
              {isSubmitting ? "Ukládám…" : "Potvrdit posun"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function NewEventModal({
  patient,
  currentUser,
  onClose,
  onCreate,
}: {
  patient: Patient;
  currentUser: string;
  onClose: () => void;
  onCreate: (event: TimelineEvent) => Promise<void>;
}) {
  const [kind, setKind] = useState<EventKind>("imaging");
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TimelineEvent["status"]>("Naplánováno");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    setFormError("");
    try {
      await onCreate({
        id: crypto.randomUUID(),
        kind,
        date,
        time: time || undefined,
        title: title.trim(),
        description: description.trim() || "Bez doplňující poznámky.",
        author: currentUser,
        status,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Událost se nepodařilo uložit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-event-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{patient.firstName} {patient.lastName}</p>
            <h2 id="new-event-title">Nová událost</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid two-columns compact-form">
            <label className="form-field">
              <span>Typ události</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as EventKind)}>
                {Object.entries(eventKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Datum</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Čas</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Stav</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as TimelineEvent["status"])}>
                <option>Naplánováno</option>
                <option>Dokončeno</option>
                <option>Čeká na výsledek</option>
              </select>
            </label>
            <label className="form-field full-column">
              <span>Název *</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Např. CT staging" autoFocus />
            </label>
            <label className="form-field full-column">
              <span>Poznámka</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Stručný popis události…" />
            </label>
            <div className="event-task-note full-column">
              <ListChecks size={17} aria-hidden="true" />
              <span>Naplánovaná událost se zobrazí také v Úkolech a termínech.</span>
            </div>
          </div>
          {formError ? (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              {formError}
            </div>
          ) : null}
          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={isSubmitting}>Zrušit</button>
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />} {isSubmitting ? "Ukládám…" : "Přidat událost"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
