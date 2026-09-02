"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock3,
  Eye,
  FileCheck2,
  FilePlus2,
  HardDrive,
  HeartPulse,
  History,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
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
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { StorageDiagnostics } from "@/components/storage-diagnostics";
import { isDepartmentMode } from "@/lib/build-info";
import {
  BiopsyStatus,
  CareTask,
  CarePhase,
  EventKind,
  Patient,
  TimelineEvent,
  TreatmentRoute,
  demoAuditEvents,
  demoTasks,
  diagnoses,
  initialPatients,
  corePathwaySteps,
  processSummarySteps,
  standardStagingExaminations,
  treatmentRoutes,
} from "@/lib/mock-data";
import {
  advancePatientThroughWorkflow,
  getWorkflowAdvanceAction,
} from "@/lib/workflow";
import type { CompletedBiopsyStatus, WorkflowAdvanceInput } from "@/lib/workflow";

type View = "dashboard" | "patients" | "patient" | "tasks" | "audit" | "storage";

type BirthNumberResult = {
  date: string;
  checksumValid: boolean | null;
  error: string;
};

const demoToday = new Date("2026-09-01T12:00:00");

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
    id: `task-next-${patient.id}-${patient.nextStepDate}-${Date.now()}`,
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
  let age = demoToday.getFullYear() - birth.getFullYear();
  const monthDifference = demoToday.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && demoToday.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
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

function maskBirthNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const suffix = digits.slice(-4).padStart(4, "•");
  return `••••••/${suffix}`;
}

const phaseStyleIndex: Record<CarePhase, number> = {
  Příjem: 1,
  Biopsie: 1,
  "Čekání na výsledek biopsie": 1,
  Staging: 2,
  "Čekání na výsledky stagingu": 2,
  MDT: 3,
  "Čekání na zahájení léčby": 3,
  "Primární operace": 4,
  "Neoadjuvantní léčba": 4,
  Paliace: 4,
  Sledování: 5,
  Recidiva: 5,
};

function PhaseBadge({ phase }: { phase: CarePhase }) {
  const waiting = phase.startsWith("Čekání");
  return (
    <span
      className={`phase-badge phase-${phaseStyleIndex[phase]} ${
        waiting ? "phase-badge-waiting" : ""
      }`}
    >
      {phase}
    </span>
  );
}

function PatientPathway({ patient }: { patient: Patient }) {
  const currentCoreIndex = corePathwaySteps.findIndex((step) => step.phase === patient.phase);
  const corePathCompleted = currentCoreIndex === -1;

  return (
    <div className="clinical-pathway">
      <div className="pathway-steps">
        {corePathwaySteps.map((step, index) => {
          const completed = corePathCompleted || index < currentCoreIndex;
          const active = index === currentCoreIndex;
          let detail = step.detail;

          if (step.phase === "Příjem") detail = formatDate(patient.intakeDate);
          if (step.phase === "Biopsie") detail = patient.biopsyStatus;
          if (step.phase === "Čekání na výsledek biopsie") {
            detail = patient.biopsyResult?.facility || "Histologický nález se zpracovává";
          }
          if (step.phase === "Staging" && patient.stagingExaminations.length > 0) {
            detail = patient.stagingExaminations.join(" · ");
          }
          if (step.phase === "Čekání na výsledky stagingu") {
            detail = patient.stagingExaminations.join(" · ") || "Kompletace nálezů";
          }
          if (step.phase === "MDT") {
            detail = patient.mdtDate ? formatDate(patient.mdtDate) : "Datum zatím neurčeno";
          }
          if (step.phase === "Čekání na zahájení léčby") {
            detail = patient.treatmentRoute ?? "Léčebná větev zatím neurčena";
          }

          return (
            <div
              className={`pathway-step ${step.kind === "waiting" ? "waiting" : ""} ${
                completed ? "completed" : ""
              } ${active ? "current" : ""}`}
              key={step.phase}
            >
              <div className="pathway-node">
                {completed ? <Check size={15} aria-hidden="true" /> : step.number}
              </div>
              <strong>{step.phase}</strong>
              <span>{detail}</span>
            </div>
          );
        })}
      </div>

      <div className="treatment-decision-heading">
        <span>5</span>
        <div>
          <strong>Rozhodnutí po MDT</strong>
          <small>
            {patient.treatmentRoute
              ? `Zvolená větev: ${patient.treatmentRoute}`
              : "Léčebná větev zatím nebyla určena"}
          </small>
        </div>
      </div>

      <div className="treatment-route-grid">
        {treatmentRoutes.map((route) => {
          const selected = patient.treatmentRoute === route.phase;
          const completed = selected && patient.phase === "Sledování";
          return (
            <div
              className={`treatment-route ${selected ? "selected" : ""} ${completed ? "completed" : ""}`}
              key={route.code}
            >
              <span className="route-code">{route.code}</span>
              <div>
                <strong>{route.phase}</strong>
                <small>
                  {selected && patient.treatmentSite ? patient.treatmentSite : route.sites}
                </small>
                {route.next && (
                  <span className="route-next">
                    <ArrowRight size={13} aria-hidden="true" /> {route.next}
                  </span>
                )}
              </div>
              {selected && <CircleCheck size={18} aria-label="Zvolená léčebná větev" />}
            </div>
          );
        })}
      </div>

      <div className={`recurrence-route ${patient.recurrence ? "active" : ""}`}>
        <span>6</span>
        <div>
          <strong>Recidiva</strong>
          <small>
            {patient.recurrence
              ? "Aktivní recidiva evidovaná v této epizodě"
              : "Samostatně sledovaná větev procesu"}
          </small>
        </div>
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

export function OncologyRegistry() {
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [tasks, setTasks] = useState<CareTask[]>(demoTasks);
  const [activeView, setActiveView] = useState<View>(() =>
    isDepartmentMode ? "storage" : "dashboard",
  );
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatients[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isAdvancePhaseOpen, setIsAdvancePhaseOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");

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

  const navigate = (view: View) => {
    setActiveView(view);
    setSidebarOpen(false);
    if (view !== "patients") setSearchQuery("");
  };

  const openPatient = (id: string) => {
    setSelectedPatientId(id);
    setActiveView("patient");
    setSidebarOpen(false);
  };

  const createPatient = (patient: Patient) => {
    setPatients((current) => [patient, ...current]);
    setTasks((current) => [createNextStepTask(patient), ...current]);
    setSelectedPatientId(patient.id);
    setActiveView("patient");
    setIsNewPatientOpen(false);
    setToast("Pacient byl přidán do demo registru.");
  };

  const addEvent = (event: TimelineEvent) => {
    if (!selectedPatient) return;
    setPatients((current) =>
      current.map((patient) =>
        patient.id === selectedPatientId
          ? {
              ...patient,
              ...(event.kind === "recurrence"
                ? {
                    phase: "Recidiva" as const,
                    recurrence: true,
                    priority: "Vysoká" as const,
                    nextStep: "Restaging a nové rozhodnutí MDT",
                    nextStepDate: event.date,
                  }
                : {}),
              events: [event, ...patient.events],
            }
          : patient,
      ),
    );
    setTasks((current) => {
      const withoutMatchingTask = current.filter(
        (task) =>
          !(
            task.patientId === selectedPatient.id &&
            task.title === event.title &&
            task.date === event.date
          ),
      );
      return event.status === "Dokončeno"
        ? withoutMatchingTask
        : [createTaskFromEvent(selectedPatient, event), ...withoutMatchingTask];
    });
    setIsNewEventOpen(false);
    setToast("Nová událost byla přidána do časové osy.");
  };

  const advancePatient = (input: WorkflowAdvanceInput) => {
    if (!selectedPatient) return;
    const updatedPatient = advancePatientThroughWorkflow(selectedPatient, input);
    if (!updatedPatient) {
      setToast("Pro posun pacienta je potřeba doplnit povinné údaje.");
      return;
    }

    setPatients((current) =>
      current.map((patient) =>
        patient.id === selectedPatient.id ? updatedPatient : patient,
      ),
    );
    setTasks((current) => [
      createNextStepTask(updatedPatient),
      ...current.filter(
        (task) => task.patientId !== selectedPatient.id || task.date > input.date,
      ),
    ]);
    setIsAdvancePhaseOpen(false);
    setToast(`Pacient byl posunut do fáze ${updatedPatient.phase}.`);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <HeartPulse size={24} />
          </div>
          <div>
            <div className="brand-name">OnkoFlow</div>
            <div className="brand-subtitle">Registr onkologické péče</div>
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
              <button
                className={`nav-item ${active ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === "tasks" ? <span className="nav-count">{tasks.length}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="security-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>{isDepartmentMode ? "Department POC" : "Demo prostředí"}</strong>
            <span>
              {isDepartmentMode
                ? "Klinické ukládání je vypnuto"
                : "Bez napojení na databázi"}
            </span>
          </div>
        </div>

        <div className="user-card">
          <div className="avatar avatar-small">AD</div>
          <div className="user-card-copy">
            <strong>Andrej Demo</strong>
            <span>Lékař · mockup</span>
          </div>
          <ChevronRight size={17} aria-hidden="true" />
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
        <div className="demo-banner" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>{isDepartmentMode ? "Diagnostická verze." : "Demo."}</strong>{" "}
            {isDepartmentMode
              ? "Pacientská evidence stále používá pouze smyšlená data a neukládá je na disk."
              : "Používejte pouze smyšlené údaje — nic se neukládá."}
          </span>
        </div>

        <header className="topbar">
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
          <div className="topbar-actions">
            {!isDepartmentMode ? (
              <button
                className="button button-primary topbar-new"
                type="button"
                aria-label="Přijmout nového pacienta"
                onClick={() => setIsNewPatientOpen(true)}
              >
                <Plus size={18} aria-hidden="true" />
                <span className="topbar-new-label">Nový pacient</span>
              </button>
            ) : null}
          </div>
        </header>

        <section className="page-content">
          {activeView === "dashboard" && (
            <DashboardView
              patients={patients}
              tasks={tasks}
              openPatient={openPatient}
              navigate={navigate}
            />
          )}
          {activeView === "patients" && (
            <PatientsView
              patients={patients}
              query={searchQuery}
              setQuery={setSearchQuery}
              openPatient={openPatient}
              openNewPatient={() => setIsNewPatientOpen(true)}
              allowPatientCreation={!isDepartmentMode}
            />
          )}
          {activeView === "patient" && selectedPatient && (
            <PatientDetail
              patient={selectedPatient}
              goBack={() => navigate("patients")}
              openNewEvent={() => setIsNewEventOpen(true)}
              openAdvancePhase={() => setIsAdvancePhaseOpen(true)}
            />
          )}
          {activeView === "tasks" && <TasksView tasks={tasks} openPatient={openPatient} />}
          {activeView === "storage" && <StorageDiagnostics />}
          {activeView === "audit" && <AuditView />}
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

      {isNewPatientOpen && !isDepartmentMode && (
        <NewPatientModal onClose={() => setIsNewPatientOpen(false)} onCreate={createPatient} />
      )}

      {isNewEventOpen && selectedPatient && (
        <NewEventModal
          patient={selectedPatient}
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
}: {
  patients: Patient[];
  tasks: CareTask[];
  openPatient: (id: string) => void;
  navigate: (view: View) => void;
}) {
  const highPriority = patients.filter((patient) => patient.priority === "Vysoká").length;
  const inTreatment = patients.filter(
    (patient) =>
      patient.phase === "Primární operace" ||
      patient.phase === "Neoadjuvantní léčba" ||
      patient.phase === "Paliace",
  ).length;
  const recentPatients = patients.slice(0, 4);
  const upcomingTasks = useMemo(
    () => [...tasks].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [tasks],
  );

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Úterý · 1. září 2026</p>
          <h1>Přehled péče</h1>
          <p>Aktuální stav pacientů a nejbližší kroky v onkologickém procesu.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => navigate("tasks")}>
          <CalendarDays size={17} aria-hidden="true" />
          Zobrazit kalendář
        </button>
      </div>

      <div className="metric-grid">
        <button className="metric-card" type="button" onClick={() => navigate("patients")}>
          <div className="metric-icon metric-blue">
            <Users size={21} aria-hidden="true" />
          </div>
          <span className="metric-label">Aktivní pacienti</span>
          <strong>{patients.length}</strong>
          <span className="metric-caption">v demo registru</span>
        </button>
        <button className="metric-card" type="button" onClick={() => navigate("patients")}>
          <div className="metric-icon metric-red">
            <AlertTriangle size={21} aria-hidden="true" />
          </div>
          <span className="metric-label">Vyšší priorita</span>
          <strong>{highPriority}</strong>
          <span className="metric-caption">vyžadují pozornost</span>
        </button>
        <button className="metric-card" type="button" onClick={() => navigate("tasks")}>
          <div className="metric-icon metric-violet">
            <UsersRound size={21} aria-hidden="true" />
          </div>
          <span className="metric-label">MDT dnes</span>
          <strong>1</strong>
          <span className="metric-caption">ve 13:30</span>
        </button>
        <button className="metric-card" type="button" onClick={() => navigate("patients")}>
          <div className="metric-icon metric-teal">
            <Activity size={21} aria-hidden="true" />
          </div>
          <span className="metric-label">V aktivní léčbě</span>
          <strong>{inTreatment}</strong>
          <span className="metric-caption">probíhající léčba</span>
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="panel patients-panel">
          <div className="panel-header">
            <div>
              <h2>Naposledy aktualizovaní pacienti</h2>
              <p>Rychlý přístup k probíhajícím epizodám péče.</p>
            </div>
            <button className="text-button" type="button" onClick={() => navigate("patients")}>
              Všichni pacienti <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="patient-list-compact">
            {recentPatients.map((patient) => (
              <button
                className="patient-compact-row"
                key={patient.id}
                type="button"
                onClick={() => openPatient(patient.id)}
              >
                <div className="avatar">{patient.initials}</div>
                <div className="patient-compact-main">
                  <div className="patient-name-line">
                    <strong>
                      {patient.firstName} {patient.lastName}
                    </strong>
                    {patient.priority === "Vysoká" && <span className="priority-dot" />}
                  </div>
                  <span>
                    {patient.primaryDiagnosisCode} · {patient.primaryDiagnosisLabel}
                  </span>
                </div>
                <PhaseBadge phase={patient.phase} />
                <div className="next-step-cell">
                  <span>{patient.nextStep}</span>
                  <strong>{formatDate(patient.nextStepDate)}</strong>
                </div>
                <ChevronRight className="row-chevron" size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className="panel schedule-panel">
          <div className="panel-header">
            <div>
              <h2>Nejbližší úkoly</h2>
              <p>Dnešní a nadcházející termíny.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Otevřít úkoly" onClick={() => navigate("tasks")}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="task-stack">
            {upcomingTasks.slice(0, 3).map((task) => (
              <button className="task-card" key={task.id} type="button" onClick={() => openPatient(task.patientId)}>
                <div className="task-date-block">
                  <strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong>
                  <span>{formatDate(task.date, false).split(" ")[1]}</span>
                </div>
                <div className="task-copy">
                  <span className={task.priority === "Vysoká" ? "task-status high" : "task-status"}>
                    {task.status}
                  </span>
                  <strong>{task.title}</strong>
                  <span>
                    {task.time} · {task.patient}
                  </span>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button className="button button-soft schedule-button" type="button" onClick={() => navigate("tasks")}>
            <ListChecks size={17} aria-hidden="true" />
            Všechny úkoly
          </button>
        </section>
      </div>

      <section className="panel process-panel">
        <div className="panel-header">
          <div>
            <h2>Proces onkologické péče</h2>
            <p>
              Hlavní fáze a čekací stavy před histologií, MDT a zahájením léčby.
            </p>
          </div>
          <span className="panel-meta">Aktualizováno právě teď</span>
        </div>
        <div className="phase-summary-grid">
          {processSummarySteps.map((step) => {
            const count = patients.filter((patient) => step.phases.includes(patient.phase)).length;
            return (
              <button
                className={`phase-summary ${step.kind === "waiting" ? "waiting" : ""}`}
                type="button"
                key={step.number}
                onClick={() => navigate("patients")}
              >
                <span className={`phase-number phase-number-${step.tone}`}>
                  {step.number}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  {step.description ? <small>{step.description}</small> : null}
                  <span>{count} pacientů</span>
                </div>
                <div className="phase-bar">
                  <span style={{ width: `${Math.max(14, (count / patients.length) * 100)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
        <div className="process-route-overview">
          <div className="process-route-label">
            <span>Výstup MDT</span>
            <strong>Tři možné větve</strong>
          </div>
          {treatmentRoutes.map((route) => {
            const count = patients.filter((patient) => patient.treatmentRoute === route.phase).length;
            return (
              <div className="process-route-card" key={route.code}>
                <span className="route-code">{route.code}</span>
                <div>
                  <strong>{route.phase}</strong>
                  <small>{route.sites}</small>
                  {route.next && (
                    <span className="route-next">
                      <ArrowRight size={13} aria-hidden="true" /> {route.next}
                    </span>
                  )}
                </div>
                <b>{count}</b>
              </div>
            );
          })}
        </div>
        <div className="process-rule-note">
          <Microscope size={17} aria-hidden="true" />
          <span>
            Pokud je při příjmu doložena biopsie z externího pracoviště, druhá biopsie se
            neplánuje a pacient pokračuje do stagingu.
          </span>
        </div>
      </section>
    </>
  );
}

function PatientsView({
  patients,
  query,
  setQuery,
  openPatient,
  openNewPatient,
  allowPatientCreation,
}: {
  patients: Patient[];
  query: string;
  setQuery: (value: string) => void;
  openPatient: (id: string) => void;
  openNewPatient: () => void;
  allowPatientCreation: boolean;
}) {
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("cs-CZ");
    if (!normalized) return patients;
    return patients.filter((patient) =>
      [
        patient.firstName,
        patient.lastName,
        patient.primaryDiagnosisCode,
        patient.primaryDiagnosisLabel,
        patient.physician,
      ]
        .join(" ")
        .toLocaleLowerCase("cs-CZ")
        .includes(normalized),
    );
  }, [patients, query]);

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Evidence pacientů</p>
          <h1>Pacienti</h1>
          <p>Aktivní onkologické epizody a jejich aktuální fáze.</p>
        </div>
        {allowPatientCreation ? (
          <button className="button button-primary" type="button" onClick={openNewPatient}>
            <Plus size={18} aria-hidden="true" />
            Přijmout pacienta do péče
          </button>
        ) : null}
      </div>

      <section className="panel patient-directory">
        <div className="directory-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Vyhledat pacienta</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hledat podle jména, diagnózy nebo lékaře…"
            />
            {query && (
              <button type="button" aria-label="Vymazat vyhledávání" onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
          </label>
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
                  <th>Pacient</th>
                  <th>Hlavní diagnóza</th>
                  <th>Fáze péče</th>
                  <th>Odpovědný lékař</th>
                  <th>Další krok</th>
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
                          <span>
                            {calculateAge(patient.dateOfBirth)} let · {patient.birthNumberMasked}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="diagnosis-cell">
                        <strong>{patient.primaryDiagnosisCode}</strong>
                        <span>{patient.primaryDiagnosisLabel}</span>
                      </div>
                    </td>
                    <td>
                      <PhaseBadge phase={patient.phase} />
                    </td>
                    <td>{patient.physician}</td>
                    <td>
                      <div className="next-step-table">
                        <span>{patient.nextStep}</span>
                        <strong>{formatDate(patient.nextStepDate)}</strong>
                      </div>
                    </td>
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
                <button
                  className="patient-mobile-card"
                  key={patient.id}
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
                        {calculateAge(patient.dateOfBirth)} let · {patient.birthNumberMasked}
                      </span>
                    </div>
                    <ChevronRight size={20} aria-hidden="true" />
                  </div>
                  <div className="patient-mobile-diagnosis">
                    <span>{patient.primaryDiagnosisCode}</span>
                    <strong>{patient.primaryDiagnosisLabel}</strong>
                    <PhaseBadge phase={patient.phase} />
                  </div>
                  <div className="patient-mobile-next">
                    <div>
                      <span>Další krok</span>
                      <strong>{patient.nextStep}</strong>
                    </div>
                    <time dateTime={patient.nextStepDate}>{formatDate(patient.nextStepDate)}</time>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="Žádný pacient neodpovídá filtru"
            description="Zkuste upravit hledaný výraz nebo zobrazit celý seznam."
            onAction={() => setQuery("")}
          />
        )}
      </section>
    </>
  );
}

function PatientDetail({
  patient,
  goBack,
  openNewEvent,
  openAdvancePhase,
}: {
  patient: Patient;
  goBack: () => void;
  openNewEvent: () => void;
  openAdvancePhase: () => void;
}) {
  const advanceAction = getWorkflowAdvanceAction(patient);

  return (
    <>
      <button className="back-button" type="button" onClick={goBack}>
        <ArrowLeft size={17} aria-hidden="true" />
        Zpět na seznam pacientů
      </button>

      <section className="patient-hero panel">
        <div className="patient-hero-main">
          <div className="avatar avatar-large">{patient.initials}</div>
          <div>
            <div className="patient-hero-title">
              <h1>
                {patient.firstName} {patient.lastName}
              </h1>
              <span className="demo-chip">DEMO</span>
            </div>
            <div className="patient-meta-line">
              <span>{patient.birthNumberMasked}</span>
              <span>nar. {formatLongDate(patient.dateOfBirth)}</span>
              <span>{calculateAge(patient.dateOfBirth)} let</span>
            </div>
          </div>
        </div>
        <div className="patient-hero-actions">
          <button className="button button-secondary" type="button">
            <PencilLine size={17} aria-hidden="true" />
            Upravit údaje
          </button>
          <button className="button button-primary" type="button" onClick={openNewEvent}>
            <Plus size={18} aria-hidden="true" />
            Přidat událost
          </button>
        </div>
      </section>

      <section className="mobile-next-action panel" aria-label="Nejbližší krok">
        <span className="mobile-next-action-icon">
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <div className="mobile-next-action-copy">
          <span>Nejbližší krok</span>
          <strong>{patient.nextStep}</strong>
          <time dateTime={patient.nextStepDate}>{formatLongDate(patient.nextStepDate)}</time>
        </div>
        {advanceAction ? (
          <button
            className="button button-primary mobile-advance-button"
            type="button"
            onClick={openAdvancePhase}
          >
            {advanceAction.label}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <div className="patient-detail-grid">
        <div className="patient-detail-main">
          <section className="panel diagnosis-overview">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Onkologická epizoda</p>
                <h2>Diagnóza a stav péče</h2>
              </div>
              <PhaseBadge phase={patient.phase} />
            </div>
            <div className="diagnosis-highlight">
              <div className="diagnosis-code-large">{patient.primaryDiagnosisCode}</div>
              <div>
                <span>Hlavní diagnóza</span>
                <strong>{patient.primaryDiagnosisLabel}</strong>
                <small>{patient.diagnosisCertainty}</small>
              </div>
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
            {patient.biopsyResult ? (
              <article className="external-biopsy-result">
                <div className="external-biopsy-result-header">
                  <span className="external-biopsy-result-icon">
                    <Microscope size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <span>
                      {patient.phase === "Čekání na výsledek biopsie"
                        ? "Biopsie provedena — čeká se na výsledek"
                        : patient.biopsyStatus === "Provedena v ÚVN"
                          ? "Výsledek biopsie z ÚVN"
                          : "Výsledek externí biopsie"}
                    </span>
                    <strong>{patient.biopsyResult.facility}</strong>
                  </div>
                </div>
                <p>
                  {patient.biopsyResult.conclusion ||
                    "Histologický závěr zatím není k dispozici."}
                </p>
                <div className="external-biopsy-result-meta">
                  <span>
                    Datum odběru / výkonu:{" "}
                    <strong>{formatLongDate(patient.biopsyResult.date)}</strong>
                  </span>
                  {patient.biopsyResult.reportReference ? (
                    <span>
                      Reference nálezu: <strong>{patient.biopsyResult.reportReference}</strong>
                    </span>
                  ) : null}
                </div>
              </article>
            ) : null}
            {patient.stagingExaminations.length > 0 ? (
              <article className="staging-examination-result">
                <div className="staging-examination-result-header">
                  <span className="staging-examination-result-icon">
                    <ScanLine size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <span>
                      {patient.phase === "Čekání na výsledky stagingu"
                        ? "Čekání na výsledky stagingu"
                        : "Dokončený staging"}
                    </span>
                    <strong>Provedená vyšetření</strong>
                  </div>
                </div>
                <ul>
                  {patient.stagingExaminations.map((examination) => (
                    <li key={examination}>
                      <CircleCheck size={16} aria-hidden="true" />
                      {examination}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </section>

          <section className="panel care-pathway-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Cesta pacienta</p>
                <h2>Průběh podle klinického procesu</h2>
              </div>
              <span className="progress-value">{patient.progress} %</span>
            </div>
            <PatientPathway patient={patient} />
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
                      <Icon size={18} aria-hidden="true" />
                    </div>
                    <div className="timeline-line" />
                    <div className="timeline-date">
                      <strong>{formatDate(event.date)}</strong>
                      <span>{eventKindLabels[event.kind]}</span>
                    </div>
                    <div className="timeline-card">
                      <div className="timeline-card-header">
                        <h3>{event.title}</h3>
                        <span className={`event-status status-${event.status.replaceAll(" ", "-").toLowerCase()}`}>
                          {event.status}
                        </span>
                      </div>
                      <p>{event.description}</p>
                      <span className="timeline-author">Zapsal/a: {event.author}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="patient-detail-aside">
          <section className="panel next-action-card">
            <div className="next-action-icon">
              <CalendarDays size={21} aria-hidden="true" />
            </div>
            <p>Nejbližší krok</p>
            <h2>{patient.nextStep}</h2>
            <strong>{formatLongDate(patient.nextStepDate)}</strong>
            {advanceAction ? (
              <button
                className="button button-primary full-width next-phase-button"
                type="button"
                onClick={openAdvancePhase}
              >
                {advanceAction.label}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                className="button button-secondary full-width"
                type="button"
                onClick={openNewEvent}
              >
                <Plus size={16} aria-hidden="true" />
                Přidat událost
              </button>
            )}
          </section>

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

          <section className="panel privacy-card">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <strong>Koncept zabezpečeného přístupu</strong>
              <span>Každé zobrazení by v produkci vytvořilo auditní záznam.</span>
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
  const todayCount = tasks.filter((task) => task.date === "2026-09-01").length;
  const thisWeekCount = tasks.filter(
    (task) => task.date >= "2026-09-01" && task.date <= "2026-09-07",
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

function AuditView() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Bezpečnost a dohledatelnost</p>
        <h1>Auditní stopa</h1>
        <p>Ukázka evidence přístupů a změn. V mockupu se nové záznamy neukládají.</p>
      </div>

      <section className="panel audit-intro">
        <div className="audit-intro-icon">
          <ShieldCheck size={25} aria-hidden="true" />
        </div>
        <div>
          <h2>Každá práce se záznamem musí být dohledatelná</h2>
          <p>
            Produkční systém by evidoval uživatele, čas, akci, dotčený záznam, účel přístupu
            a technický kontext bez ukládání citlivého obsahu do logu.
          </p>
        </div>
      </section>

      <section className="panel audit-panel">
        <div className="panel-header">
          <div>
            <h2>Poslední aktivita</h2>
            <p>Fiktivní data pro prezentaci rozhraní.</p>
          </div>
          <span className="demo-chip">DEMO LOG</span>
        </div>
        <div className="audit-list">
          {demoAuditEvents.map((event) => (
            <div className="audit-row" key={event.id}>
              <div className={`audit-action-icon ${event.category === "Změna" ? "change" : "read"}`}>
                {event.category === "Změna" ? <PencilLine size={17} /> : <Eye size={17} />}
              </div>
              <div className="audit-time">
                <strong>{event.time.split(", ")[1]}</strong>
                <span>{event.time.split(", ")[0]}</span>
              </div>
              <div className="audit-main">
                <strong>{event.action}</strong>
                <span>{event.patient}</span>
              </div>
              <div className="audit-user">
                <span>{event.user}</span>
                <small>{event.category}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function NewPatientModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (patient: Patient) => void;
}) {
  const [birthNumber, setBirthNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [intakeDate, setIntakeDate] = useState("2026-09-01");
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

  const fillDemo = () => {
    setBirthNumber("905101/9999");
    setFirstName("Nová");
    setLastName("Testovací");
    setPrimaryDiagnosis("C54.1");
    setCertainty("Histologicky potvrzená");
    setBiopsyStatus("Provedena v ÚVN");
    setBiopsyDate("2026-08-25");
    setBiopsyFacility("");
    setBiopsyReference("HIST-DEMO-2026-0001");
    setBiopsyConclusion(
      "Endometrioidní adenokarcinom endometria, FIGO grade 2 (demo výsledek).",
    );
    setFormError("");
  };

  const addSecondaryDiagnosis = () => {
    if (!secondarySelection || secondaryDiagnoses.includes(secondarySelection)) return;
    setSecondaryDiagnoses((current) => [...current, secondarySelection]);
    setSecondarySelection("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!birthNumberResult.date || birthNumberResult.error) {
      setFormError("Zkontrolujte rodné číslo a odvozené datum narození.");
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

    const timestamp = Date.now();
    const id = `demo-${timestamp}`;
    const biopsyResult: Patient["biopsyResult"] = biopsyAlreadyCompleted
      ? {
          date: biopsyDate,
          facility: biopsyStatus === "Provedena v ÚVN" ? "ÚVN Praha" : biopsyFacility.trim(),
          reportReference: biopsyReference.trim(),
          conclusion: biopsyConclusion.trim(),
        }
      : null;
    const intakeEvent: TimelineEvent = {
      id: `event-${timestamp}-intake`,
      kind: "intake",
      date: intakeDate,
      title: "Přijetí pacienta do péče",
      description: `Hlavní diagnóza ${selectedDiagnosis.code} – ${selectedDiagnosis.label}.`,
      author: "Andrej Demo",
      status: "Dokončeno",
    };
    const events: TimelineEvent[] = biopsyAlreadyCompleted
      ? [
          {
            id: `event-${timestamp}-biopsy`,
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
            author: "Andrej Demo",
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
      birthNumberMasked: maskBirthNumber(birthNumber),
      dateOfBirth: birthNumberResult.date,
      primaryDiagnosisCode: selectedDiagnosis.code,
      primaryDiagnosisLabel: selectedDiagnosis.label,
      secondaryDiagnoses,
      diagnosisCertainty: certainty,
      intakeDate,
      biopsyStatus,
      biopsyResult,
      stagingExaminations: [],
      mdtDate: null,
      treatmentRoute: null,
      treatmentSite: null,
      recurrence: false,
      phase: biopsyAlreadyCompleted ? "Staging" : "Biopsie",
      progress: biopsyAlreadyCompleted ? 40 : 20,
      physician: "Andrej Demo",
      nextStep: biopsyAlreadyCompleted ? "Naplánovat staging" : "Naplánovat biopsii",
      nextStepDate: "2026-09-08",
      priority: "Běžná",
      events,
    };
    onCreate(patient);
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

        <div className="modal-demo-note">
          <LockKeyhole size={17} aria-hidden="true" />
          <span>Demo formulář — nevkládejte skutečné identifikační ani zdravotní údaje.</span>
          <button type="button" onClick={fillDemo}>
            Vyplnit testovací údaje
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
                    Kontrolní součet neodpovídá — v demo režimu lze pokračovat.
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
                <small>Mockup obsahuje zkrácený výběr onkogynekologických diagnóz.</small>
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
            <button className="button button-secondary" type="button" onClick={onClose}>
              Zrušit
            </button>
            <button className="button button-primary" type="submit">
              <FileCheck2 size={18} aria-hidden="true" />
              Přijmout do péče
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
  onAdvance: (input: WorkflowAdvanceInput) => void;
}) {
  const action = getWorkflowAdvanceAction(patient);
  const dialogRef = useRef<HTMLElement>(null);
  const [date, setDate] = useState("2026-09-02");
  const [note, setNote] = useState("");
  const [biopsyStatus, setBiopsyStatus] = useState<CompletedBiopsyStatus | null>(() =>
    patient.biopsyStatus === "Nutno provést" ? null : patient.biopsyStatus,
  );
  const [biopsyDate, setBiopsyDate] = useState(
    patient.biopsyResult?.date ?? "2026-09-02",
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
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

    onAdvance({
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
              <PhaseBadge phase={patient.phase} />
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
              <legend>Léčebná větev doporučená MDT *</legend>
              <p>Volba nastaví další fázi i nejbližší klinický krok.</p>
              <div className="route-choice-grid">
                {treatmentRoutes.map((route) => (
                  <label
                    className={`route-choice-option ${
                      treatmentRoute === route.phase ? "selected" : ""
                    }`}
                    key={route.code}
                  >
                    <input
                      type="radio"
                      name="treatment-route"
                      value={route.phase}
                      checked={treatmentRoute === route.phase}
                      onChange={() => {
                        setTreatmentRoute(route.phase);
                        setFormError("");
                      }}
                    />
                    <span className="route-code">{route.code}</span>
                    <span className="route-choice-copy">
                      <strong>{route.phase}</strong>
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
            <button className="button button-secondary" type="button" onClick={onClose}>
              Zrušit
            </button>
            <button className="button button-primary" type="submit">
              <ArrowRight size={17} aria-hidden="true" />
              Potvrdit posun
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function NewEventModal({
  patient,
  onClose,
  onCreate,
}: {
  patient: Patient;
  onClose: () => void;
  onCreate: (event: TimelineEvent) => void;
}) {
  const [kind, setKind] = useState<EventKind>("imaging");
  const [date, setDate] = useState("2026-09-01");
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TimelineEvent["status"]>("Naplánováno");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate({
      id: `event-${Date.now()}`,
      kind,
      date,
      time: time || undefined,
      title: title.trim(),
      description: description.trim() || "Bez doplňující poznámky.",
      author: "Andrej Demo",
      status,
    });
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
          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={onClose}>Zrušit</button>
            <button className="button button-primary" type="submit">
              <Plus size={17} aria-hidden="true" /> Přidat událost
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
