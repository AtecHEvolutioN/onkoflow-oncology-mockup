export type CoreCarePhase = "Příjem" | "Biopsie" | "Staging" | "MDT";

export type LegacyWaitingCarePhase =
  | "Čekání na výsledek biopsie"
  | "Čekání na výsledky stagingu";

export type TreatmentRoute = "Primární operace" | "Neoadjuvantní léčba" | "Paliace";

export type CarePhase =
  | CoreCarePhase
  | "Terapie"
  | LegacyWaitingCarePhase
  // Kept only so records created by versions <= 0.7.1 can be loaded and migrated.
  | TreatmentRoute
  | "Sledování"
  | "Recidiva";

export type BiopsyStatus = "Nutno provést" | "Provedena v ÚVN" | "Provedena externě";
export type TreatmentSite = "ÚVN" | "Motol" | "Externí";

export type BiopsyResult = {
  date: string;
  facility: string;
  reportReference: string;
  conclusion: string;
};

export type StagingExamination = {
  id: string;
  name: string;
  date: string;
  result: string;
};

export type MdtDetails = {
  surgeryPerformed: "" | "Ano" | "Ne";
  surgeryDate: string;
  surgeryDiagnosis: string;
  operator: string;
  histologyType: string;
  histologyNumber: string;
  histologyGrade: string;
  recommendedImaging: string;
  imagingIntervalMonths: string;
  imagingDate: string;
  imagingSite: string;
  checkupDate: string;
  oncologist: string;
  nationalOncologyRegistry: string;
  karnofsky: string;
  attendees: string;
};

export type EventKind =
  | "intake"
  | "pathology"
  | "imaging"
  | "mdt"
  | "surgery"
  | "systemic"
  | "followup"
  | "recurrence";

export type TimelineEvent = {
  id: string;
  kind: EventKind;
  date: string;
  time?: string;
  title: string;
  description: string;
  author: string;
  status: "Dokončeno" | "Naplánováno" | "Čeká na výsledek";
};

export type CareTask = {
  id: string;
  patientId: string;
  patient: string;
  title: string;
  date: string;
  time: string;
  status: string;
  priority: "Běžná" | "Vysoká";
};

export type Patient = {
  id: string;
  initials: string;
  firstName: string;
  lastName: string;
  birthNumber: string;
  dateOfBirth: string;
  primaryDiagnosisCode: string;
  primaryDiagnosisLabel: string;
  secondaryDiagnoses: string[];
  diagnosisCertainty: "Suspektní" | "Předběžně potvrzená" | "Histologicky potvrzená";
  intakeDate: string;
  biopsyStatus: BiopsyStatus;
  biopsyResult: BiopsyResult | null;
  stagingExaminations: string[];
  stagingDetails?: StagingExamination[];
  mdtDate: string | null;
  mdtConclusion?: string;
  mdtDetails?: MdtDetails;
  treatmentRoute: TreatmentRoute | null;
  treatmentSite: TreatmentSite | null;
  recurrence: boolean;
  phase: CarePhase;
  progress: number;
  physician: string;
  nextStep: string;
  nextStepDate: string;
  priority: "Běžná" | "Vysoká";
  events: TimelineEvent[];
};

export const standardStagingExaminations = ["CT", "MRI", "PET/CT", "Tumorové markery"] as const;

export const corePathwaySteps: Array<{
  phase: CoreCarePhase | "Terapie";
  number: string;
  detail: string;
}> = [
  { phase: "Příjem", number: "1", detail: "RČ · diagnóza · datum" },
  { phase: "Biopsie", number: "2", detail: "termín · výsledek" },
  { phase: "Staging", number: "3", detail: "vyšetření · výsledky" },
  { phase: "MDT", number: "4", detail: "termín · závěr" },
  { phase: "Terapie", number: "5", detail: "léčebná strategie" },
];

export const treatmentRoutes: Array<{
  code: "A" | "B" | "C";
  label: TreatmentRoute;
  sites: string;
  next: string | null;
}> = [
  { code: "A", label: "Primární operace", sites: "ÚVN / externí pracoviště", next: null },
  {
    code: "B",
    label: "Neoadjuvantní léčba",
    sites: "ÚVN / Motol / externí pracoviště",
    next: "Následně operační léčba",
  },
  { code: "C", label: "Paliace", sites: "Individuální plán symptomatické péče", next: null },
];

export const processSummarySteps: Array<{
  number: string;
  label: string;
  description?: string;
  phases: CarePhase[];
  tone: 1 | 2 | 3 | 4 | 5 | 6;
}> = [
  { number: "1", label: "Příjem", phases: ["Příjem"], tone: 1 },
  { number: "2", label: "Biopsie", phases: ["Biopsie", "Čekání na výsledek biopsie"], tone: 2 },
  {
    number: "3",
    label: "Staging",
    phases: ["Staging", "Čekání na výsledky stagingu"],
    tone: 3,
  },
  {
    number: "4",
    label: "MDT",
    description: "Multidisciplinární tým",
    phases: ["MDT"],
    tone: 4,
  },
  {
    number: "5",
    label: "Terapie",
    phases: ["Terapie", "Primární operace", "Neoadjuvantní léčba", "Paliace"],
    tone: 5,
  },
  { number: "↻", label: "Recidiva", phases: ["Recidiva"], tone: 6 },
];
