export type CoreCarePhase =
  | "Příjem"
  | "Biopsie"
  | "Staging"
  | "MDT";

export type TreatmentRoute =
  | "Primární operace"
  | "Neoadjuvantní léčba"
  | "Paliace";

export type CarePhase = CoreCarePhase | TreatmentRoute | "Sledování" | "Recidiva";

export type BiopsyStatus =
  | "Nutno provést"
  | "Provedena v ÚVN"
  | "Provedena externě";

export type TreatmentSite = "ÚVN" | "Motol" | "Externí";

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
  title: string;
  description: string;
  author: string;
  status: "Dokončeno" | "Naplánováno" | "Čeká na výsledek";
};

export type Patient = {
  id: string;
  initials: string;
  firstName: string;
  lastName: string;
  birthNumberMasked: string;
  dateOfBirth: string;
  primaryDiagnosisCode: string;
  primaryDiagnosisLabel: string;
  secondaryDiagnoses: string[];
  diagnosisCertainty: "Suspektní" | "Předběžně potvrzená" | "Histologicky potvrzená";
  intakeDate: string;
  biopsyStatus: BiopsyStatus;
  mdtDate: string | null;
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
  {
    code: "C57",
    label: "Zhoubný novotvar jiných a neurčených ženských pohlavních orgánů",
  },
  { code: "C77", label: "Sekundární a neurčený zhoubný novotvar mízních uzlin" },
  { code: "C78", label: "Sekundární zhoubný novotvar dýchací a trávicí soustavy" },
  { code: "C79", label: "Sekundární zhoubný novotvar jiných lokalizací" },
  { code: "D06", label: "Karcinom in situ hrdla děložního" },
  { code: "D07", label: "Karcinom in situ jiných a neurčených pohlavních orgánů" },
];

export const initialPatients: Patient[] = [
  {
    id: "demo-001",
    initials: "AT",
    firstName: "Anna",
    lastName: "Testová",
    birthNumberMasked: "••••••/1048",
    dateOfBirth: "1968-04-12",
    primaryDiagnosisCode: "C54.1",
    primaryDiagnosisLabel: "Zhoubný novotvar endometria",
    secondaryDiagnoses: ["I10"],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-08-12",
    biopsyStatus: "Provedena v ÚVN",
    mdtDate: "2026-08-27",
    treatmentRoute: "Primární operace",
    treatmentSite: "ÚVN",
    recurrence: false,
    phase: "Primární operace",
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
    birthNumberMasked: "••••••/2216",
    dateOfBirth: "1975-11-03",
    primaryDiagnosisCode: "C56",
    primaryDiagnosisLabel: "Zhoubný novotvar vaječníku",
    secondaryDiagnoses: ["C78"],
    diagnosisCertainty: "Předběžně potvrzená",
    intakeDate: "2026-08-24",
    biopsyStatus: "Provedena externě",
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
    birthNumberMasked: "••••••/3062",
    dateOfBirth: "1982-02-19",
    primaryDiagnosisCode: "C53.1",
    primaryDiagnosisLabel: "Zhoubný novotvar exocervixu",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-07-30",
    biopsyStatus: "Provedena v ÚVN",
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
    birthNumberMasked: "••••••/4179",
    dateOfBirth: "1959-09-07",
    primaryDiagnosisCode: "C51",
    primaryDiagnosisLabel: "Zhoubný novotvar vulvy",
    secondaryDiagnoses: ["E11", "I10"],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-05-14",
    biopsyStatus: "Provedena v ÚVN",
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
    birthNumberMasked: "••••••/5293",
    dateOfBirth: "1971-06-28",
    primaryDiagnosisCode: "D06",
    primaryDiagnosisLabel: "Karcinom in situ hrdla děložního",
    secondaryDiagnoses: [],
    diagnosisCertainty: "Histologicky potvrzená",
    intakeDate: "2026-08-31",
    biopsyStatus: "Nutno provést",
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

export const demoTasks = [
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
  phase: CoreCarePhase;
  number: number;
  detail: string;
}> = [
  { phase: "Příjem", number: 1, detail: "RČ · diagnóza · datum" },
  { phase: "Biopsie", number: 2, detail: "ÚVN / externí" },
  { phase: "Staging", number: 3, detail: "CT · MRI · PET/CT · TM" },
  { phase: "MDT", number: 4, detail: "datum · rozhodnutí" },
];

export const treatmentRoutes: Array<{
  code: "A" | "B" | "C";
  phase: TreatmentRoute;
  sites: string;
  next: string | null;
}> = [
  {
    code: "A",
    phase: "Primární operace",
    sites: "ÚVN / externí pracoviště",
    next: null,
  },
  {
    code: "B",
    phase: "Neoadjuvantní léčba",
    sites: "ÚVN / Motol / externí pracoviště",
    next: "Následně operační léčba",
  },
  {
    code: "C",
    phase: "Paliace",
    sites: "Individuální plán symptomatické péče",
    next: null,
  },
];

export const processSummarySteps: Array<{
  number: number;
  label: string;
  phases: CarePhase[];
}> = [
  { number: 1, label: "Příjem", phases: ["Příjem"] },
  { number: 2, label: "Biopsie", phases: ["Biopsie"] },
  { number: 3, label: "Staging", phases: ["Staging"] },
  { number: 4, label: "MDT", phases: ["MDT"] },
  {
    number: 5,
    label: "Léčebná větev",
    phases: ["Primární operace", "Neoadjuvantní léčba", "Paliace", "Sledování"],
  },
  { number: 6, label: "Recidiva", phases: ["Recidiva"] },
];
