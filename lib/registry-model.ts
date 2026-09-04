export type CoreCarePhase = "Příjem" | "Biopsie" | "Staging" | "MDT";

export type LegacyWaitingCarePhase =
  | "Čekání na výsledek biopsie"
  | "Čekání na výsledky stagingu";

export type TreatmentRoute = "Primární operace" | "Neoadjuvantní léčba" | "Paliace";

export type CarePhase =
  | CoreCarePhase
  | LegacyWaitingCarePhase
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

export const diagnoses = [
  { code: "C51", label: "Zhoubný novotvar vulvy" },
  { code: "C52", label: "Zhoubný novotvar pochvy" },
  { code: "C53", label: "Zhoubný novotvar hrdla děložního" },
  { code: "C53.1", label: "Zhoubný novotvar exocervixu" },
  { code: "C54", label: "Zhoubný novotvar těla děložního" },
  { code: "C54.1", label: "Zhoubný novotvar endometria" },
  { code: "C55", label: "Zhoubný novotvar dělohy, část NS" },
  { code: "C56", label: "Zhoubný novotvar vaječníku" },
  { code: "C57", label: "Zhoubný novotvar jiných a neurčených ženských pohlavních orgánů" },
  { code: "C77", label: "Sekundární a neurčený zhoubný novotvar mízních uzlin" },
  { code: "C78", label: "Sekundární zhoubný novotvar dýchací a trávicí soustavy" },
  { code: "C79", label: "Sekundární zhoubný novotvar jiných lokalizací" },
  { code: "D06", label: "Karcinom in situ hrdla děložního" },
  { code: "D07", label: "Karcinom in situ jiných a neurčených pohlavních orgánů" },
];

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
  { phase: "Terapie", number: "5", detail: "léčebná větev" },
];

export const treatmentRoutes: Array<{
  code: "A" | "B" | "C";
  phase: TreatmentRoute;
  sites: string;
  next: string | null;
}> = [
  { code: "A", phase: "Primární operace", sites: "ÚVN / externí pracoviště", next: null },
  {
    code: "B",
    phase: "Neoadjuvantní léčba",
    sites: "ÚVN / Motol / externí pracoviště",
    next: "Následně operační léčba",
  },
  { code: "C", phase: "Paliace", sites: "Individuální plán symptomatické péče", next: null },
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
    phases: ["Primární operace", "Neoadjuvantní léčba", "Paliace", "Sledování"],
    tone: 5,
  },
  { number: "6", label: "Recidiva", phases: ["Recidiva"], tone: 6 },
];
