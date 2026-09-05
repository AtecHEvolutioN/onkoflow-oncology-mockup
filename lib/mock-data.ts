export type CoreCarePhase =
  | "Příjem"
  | "Biopsie"
  | "Staging"
  | "MDT";

export type WaitingCarePhase =
  | "Čekání na výsledek biopsie"
  | "Čekání na výsledky stagingu";

export type TreatmentRoute =
  | "Primární operace"
  | "Neoadjuvantní léčba"
  | "Paliace";

export type CarePhase =
  | CoreCarePhase
  | "Terapie"
  | WaitingCarePhase
  | TreatmentRoute
  | "Sledování"
  | "Recidiva";

export type BiopsyStatus =
  | "Nutno provést"
  | "Provedena v ÚVN"
  | "Provedena externě";

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

export const standardStagingExaminations = [
  "CT",
  "MRI",
  "PET/CT",
  "Tumorové markery",
] as const;

export const initialPatients: Patient[] = [
  {
    id: "demo-001",
    initials: "AT",
    firstName: "Anna",
    lastName: "Testová",
    birthNumber: "685412/0000",
    dateOfBirth: "1968-04-12",
    primaryDiagnosisCode: "C54.1",
    primaryDiagnosisLabel: "Zhoubný novotvar endometria",
    secondaryDiagnoses: ["I10"],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-08-12",
    biopsyStatus: "Provedena v ÚVN",
    biopsyResult: {
      date: "2026-08-20",
      facility: "ÚVN Praha",
      reportReference: "HIST-DEMO-2026-1048",
      conclusion: "Endometroidní adenokarcinom, další parametry v dokumentaci.",
    },
    stagingExaminations: ["CT", "MRI", "Tumorové markery"],
    mdtDate: "2026-08-27",
    treatmentRoute: "Primární operace",
    treatmentSite: "ÚVN",
    recurrence: false,
    phase: "Terapie",
    progress: 80,
    physician: "MUDr. Lucie Demo",
    nextStep: "Předoperační kontrola",
    nextStepDate: "2026-09-03",
    priority: "Běžná",
    events: [
      {
        id: "e-001-4",
        kind: "surgery",
        date: "2026-09-08",
        title: "Operační výkon",
        description: "Plánována hysterektomie se stagingovým výkonem.",
        author: "Operační program",
        status: "Naplánováno",
      },
      {
        id: "e-001-3",
        kind: "mdt",
        date: "2026-08-27",
        title: "Rozhodnutí multidisciplinárního týmu",
        description: "Doporučena primární chirurgická léčba.",
        author: "Onkogynekologický MDT",
        status: "Dokončeno",
      },
      {
        id: "e-001-2",
        kind: "pathology",
        date: "2026-08-20",
        title: "Výsledek histologie",
        description: "Endometroidní adenokarcinom, další parametry v dokumentaci.",
        author: "Oddělení patologie",
        status: "Dokončeno",
      },
      {
        id: "e-001-1",
        kind: "intake",
        date: "2026-08-12",
        title: "Přijetí pacientky do péče",
        description: "Hlavní diagnóza C54.1, převzetí do onkogynekologické péče.",
        author: "MUDr. Lucie Demo",
        status: "Dokončeno",
      },
    ],
  },
  {
    id: "demo-002",
    initials: "BU",
    firstName: "Běla",
    lastName: "Ukázková",
    birthNumber: "756103/0000",
    dateOfBirth: "1975-11-03",
    primaryDiagnosisCode: "C56",
    primaryDiagnosisLabel: "Zhoubný novotvar vaječníku",
    secondaryDiagnoses: ["C78"],
    diagnosisCertainty: "Předběžně potvrzená",
    intakeDate: "2026-08-24",
    biopsyStatus: "Provedena externě",
    biopsyResult: {
      date: "2026-08-18",
      facility: "Krajská nemocnice Demo",
      reportReference: "HIST-DEMO-2026-1842",
      conclusion: "Suspektní high-grade serózní karcinom; preparáty předány k revizi.",
    },
    stagingExaminations: [],
    mdtDate: null,
    treatmentRoute: null,
    treatmentSite: null,
    recurrence: false,
    phase: "Staging",
    progress: 45,
    physician: "MUDr. Petr Vzor",
    nextStep: "CT hrudníku a břicha",
    nextStepDate: "2026-09-02",
    priority: "Vysoká",
    events: [
      {
        id: "e-002-3",
        kind: "imaging",
        date: "2026-09-02",
        title: "CT staging",
        description: "CT hrudníku, břicha a pánve s kontrastní látkou.",
        author: "Radiodiagnostické oddělení",
        status: "Naplánováno",
      },
      {
        id: "e-002-2",
        kind: "pathology",
        date: "2026-08-28",
        title: "Revize histologických preparátů",
        description: "Preparáty převzaty k revizi.",
        author: "Oddělení patologie",
        status: "Čeká na výsledek",
      },
      {
        id: "e-002-1",
        kind: "intake",
        date: "2026-08-24",
        title: "Přijetí pacientky do péče",
        description: "Převzata z regionálního pracoviště pro suspektní ovariální malignitu.",
        author: "MUDr. Petr Vzor",
        status: "Dokončeno",
      },
    ],
  },
  {
    id: "demo-003",
    initials: "CD",
    firstName: "Cecílie",
    lastName: "Demo",
    birthNumber: "825219/0000",
    dateOfBirth: "1982-02-19",
    primaryDiagnosisCode: "C53.1",
    primaryDiagnosisLabel: "Zhoubný novotvar exocervixu",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-07-30",
    biopsyStatus: "Provedena v ÚVN",
    biopsyResult: {
      date: "2026-08-06",
      facility: "ÚVN Praha",
      reportReference: "HIST-DEMO-2026-3062",
      conclusion: "Spinocelulární karcinom děložního hrdla (syntetický nález).",
    },
    stagingExaminations: ["MRI"],
    mdtDate: "2026-09-01",
    treatmentRoute: null,
    treatmentSite: null,
    recurrence: false,
    phase: "MDT",
    progress: 65,
    physician: "MUDr. Lucie Demo",
    nextStep: "Prezentace na MDT",
    nextStepDate: "2026-09-01",
    priority: "Vysoká",
    events: [
      {
        id: "e-003-3",
        kind: "mdt",
        date: "2026-09-01",
        title: "Prezentace na MDT",
        description: "Volba dalšího léčebného postupu po dokončení stagingu.",
        author: "Onkogynekologický MDT",
        status: "Naplánováno",
      },
      {
        id: "e-003-2",
        kind: "imaging",
        date: "2026-08-21",
        title: "MRI pánve",
        description: "Stagingové vyšetření dokončeno.",
        author: "Radiodiagnostické oddělení",
        status: "Dokončeno",
      },
      {
        id: "e-003-1",
        kind: "intake",
        date: "2026-07-30",
        title: "Přijetí pacientky do péče",
        description: "Hlavní diagnóza C53.1, histologicky potvrzena.",
        author: "MUDr. Lucie Demo",
        status: "Dokončeno",
      },
    ],
  },
  {
    id: "demo-004",
    initials: "DV",
    firstName: "Dora",
    lastName: "Vzorová",
    birthNumber: "595907/0000",
    dateOfBirth: "1959-09-07",
    primaryDiagnosisCode: "C51",
    primaryDiagnosisLabel: "Zhoubný novotvar vulvy",
    secondaryDiagnoses: ["E11", "I10"],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-05-14",
    biopsyStatus: "Provedena v ÚVN",
    biopsyResult: {
      date: "2026-05-16",
      facility: "ÚVN Praha",
      reportReference: "HIST-DEMO-2026-4179",
      conclusion: "Spinocelulární karcinom vulvy (syntetický nález).",
    },
    stagingExaminations: ["CT"],
    mdtDate: "2026-05-21",
    treatmentRoute: "Primární operace",
    treatmentSite: "ÚVN",
    recurrence: false,
    phase: "Sledování",
    progress: 100,
    physician: "MUDr. Petr Vzor",
    nextStep: "Kontrolní vyšetření",
    nextStepDate: "2026-11-12",
    priority: "Běžná",
    events: [
      {
        id: "e-004-3",
        kind: "followup",
        date: "2026-11-12",
        title: "Dispenzární kontrola",
        description: "První plánovaná kontrola po ukončení primární léčby.",
        author: "Onkogynekologická ambulance",
        status: "Naplánováno",
      },
      {
        id: "e-004-2",
        kind: "surgery",
        date: "2026-06-02",
        title: "Operační léčba",
        description: "Výkon dokončen bez evidované komplikace v mockupu.",
        author: "Operační tým",
        status: "Dokončeno",
      },
      {
        id: "e-004-1",
        kind: "intake",
        date: "2026-05-14",
        title: "Přijetí pacientky do péče",
        description: "Převzetí do péče s diagnózou C51.",
        author: "MUDr. Petr Vzor",
        status: "Dokončeno",
      },
    ],
  },
  {
    id: "demo-005",
    initials: "EF",
    firstName: "Eva",
    lastName: "Fiktivní",
    birthNumber: "715628/0000",
    dateOfBirth: "1971-06-28",
    primaryDiagnosisCode: "D06",
    primaryDiagnosisLabel: "Karcinom in situ hrdla děložního",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-08-31",
    biopsyStatus: "Nutno provést",
    biopsyResult: null,
    stagingExaminations: [],
    mdtDate: null,
    treatmentRoute: null,
    treatmentSite: null,
    recurrence: false,
    phase: "Biopsie",
    progress: 20,
    physician: "MUDr. Lucie Demo",
    nextStep: "Biopsie / histologická verifikace",
    nextStepDate: "2026-09-07",
    priority: "Běžná",
    events: [
      {
        id: "e-005-2",
        kind: "pathology",
        date: "2026-09-07",
        title: "Biopsie děložního hrdla",
        description: "Plánovaná histologická verifikace před stagingem.",
        author: "Onkogynekologická ambulance",
        status: "Naplánováno",
      },
      {
        id: "e-005-1",
        kind: "intake",
        date: "2026-08-31",
        title: "Přijetí pacientky do péče",
        description: "Nové převzetí do péče s diagnózou D06.",
        author: "MUDr. Lucie Demo",
        status: "Dokončeno",
      },
    ],
  },
];

export const demoTasks: CareTask[] = [
  {
    id: "t1",
    patientId: "demo-003",
    patient: "Cecílie Demo",
    title: "Prezentace na MDT",
    date: "2026-09-01",
    time: "13:30",
    status: "Dnes",
    priority: "Vysoká",
  },
  {
    id: "t2",
    patientId: "demo-002",
    patient: "Běla Ukázková",
    title: "CT hrudníku, břicha a pánve",
    date: "2026-09-02",
    time: "09:15",
    status: "Zítra",
    priority: "Vysoká",
  },
  {
    id: "t3",
    patientId: "demo-001",
    patient: "Anna Testová",
    title: "Předoperační kontrola",
    date: "2026-09-03",
    time: "08:00",
    status: "Za 2 dny",
    priority: "Běžná",
  },
  {
    id: "t4",
    patientId: "demo-005",
    patient: "Eva Fiktivní",
    title: "Biopsie / histologická verifikace",
    date: "2026-09-07",
    time: "10:40",
    status: "Za 6 dní",
    priority: "Běžná",
  },
];

export const demoAuditEvents = [
  {
    id: "a1",
    time: "01. 09. 2026, 10:42",
    user: "MUDr. Lucie Demo",
    action: "Zobrazení detailu pacientky",
    patient: "Anna Testová",
    category: "Čtení",
  },
  {
    id: "a2",
    time: "01. 09. 2026, 10:31",
    user: "MUDr. Petr Vzor",
    action: "Doplnění klinické události",
    patient: "Běla Ukázková",
    category: "Změna",
  },
  {
    id: "a3",
    time: "01. 09. 2026, 09:58",
    user: "Koordinátor Demo",
    action: "Naplánování kontroly",
    patient: "Eva Fiktivní",
    category: "Změna",
  },
  {
    id: "a4",
    time: "01. 09. 2026, 09:17",
    user: "MUDr. Lucie Demo",
    action: "Zobrazení seznamu pacientek",
    patient: "—",
    category: "Čtení",
  },
];

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
  {
    code: "A",
    label: "Primární operace",
    sites: "ÚVN / externí pracoviště",
    next: null,
  },
  {
    code: "B",
    label: "Neoadjuvantní léčba",
    sites: "ÚVN / Motol / externí pracoviště",
    next: "Následně operační léčba",
  },
  {
    code: "C",
    label: "Paliace",
    sites: "Individuální plán symptomatické péče",
    next: null,
  },
];

export const processSummarySteps: Array<{
  number: string;
  label: string;
  description?: string;
  phases: CarePhase[];
  tone: 1 | 2 | 3 | 4 | 5 | 6;
  kind: "phase";
}> = [
  { number: "1", label: "Příjem", phases: ["Příjem"], tone: 1, kind: "phase" },
  { number: "2", label: "Biopsie", phases: ["Biopsie", "Čekání na výsledek biopsie"], tone: 2, kind: "phase" },
  { number: "3", label: "Staging", phases: ["Staging"], tone: 3, kind: "phase" },
  {
    number: "4",
    label: "MDT",
    description: "Multidisciplinární tým",
    phases: ["MDT", "Čekání na výsledky stagingu"],
    tone: 4,
    kind: "phase",
  },
  {
    number: "5",
    label: "Terapie",
    phases: ["Terapie", "Primární operace", "Neoadjuvantní léčba", "Paliace"],
    tone: 5,
    kind: "phase",
  },
  { number: "↻", label: "Recidiva", phases: ["Recidiva"], tone: 6, kind: "phase" },
];
