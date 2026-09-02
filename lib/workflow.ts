import type {
  BiopsyStatus,
  CarePhase,
  EventKind,
  Patient,
  TimelineEvent,
  TreatmentRoute,
} from "./mock-data";

export type CompletedBiopsyStatus = Exclude<BiopsyStatus, "Nutno provést">;

export type WorkflowAdvanceAction = {
  label: string;
  targetLabel: string;
  description: string;
};

export type WorkflowAdvanceInput = {
  date: string;
  note: string;
  biopsyStatus: CompletedBiopsyStatus | null;
  biopsyResult: Patient["biopsyResult"];
  stagingExaminations: string[];
  treatmentRoute: TreatmentRoute | null;
};

type WorkflowTransitionPlan = {
  nextPhase: CarePhase;
  progress: number;
  nextStep: string;
  nextStepDelayDays: number;
  eventKind: EventKind;
  eventTitle: string;
  eventDescription: string;
  changes?: Partial<
    Pick<
      Patient,
      | "biopsyStatus"
      | "biopsyResult"
      | "stagingExaminations"
      | "diagnosisCertainty"
      | "mdtDate"
      | "treatmentRoute"
      | "treatmentSite"
    >
  >;
};

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWorkflowAdvanceAction(patient: Patient): WorkflowAdvanceAction | null {
  switch (patient.phase) {
    case "Příjem":
      return patient.biopsyStatus === "Nutno provést"
        ? {
            label: "Pokračovat do biopsie",
            targetLabel: "Biopsie",
            description: "Uzavře příjem a nastaví histologickou verifikaci jako další krok.",
          }
        : {
            label: "Pokračovat do stagingu",
            targetLabel: "Staging",
            description: "Biopsie je již doložena, takže se neopakuje.",
          };
    case "Biopsie":
      return {
        label: "Dokončit biopsii a pokračovat",
        targetLabel: "Staging",
        description: "Zaznamená původ biopsie a otevře stagingová vyšetření.",
      };
    case "Staging":
      return {
        label: "Dokončit staging a předat na MDT",
        targetLabel: "MDT",
        description: "Uzavře staging a nastaví multidisciplinární rozhodnutí jako další krok.",
      };
    case "MDT":
      return {
        label: "Vybrat léčebnou větev",
        targetLabel: "Rozhodnutí po MDT",
        description: "Vyberte primární operaci, neoadjuvantní léčbu, nebo paliaci.",
      };
    case "Neoadjuvantní léčba":
      return {
        label: "Předat k operační léčbě",
        targetLabel: "Primární operace",
        description: "Uzavře neoadjuvantní léčbu a naplánuje operační výkon.",
      };
    case "Primární operace":
      return {
        label: "Ukončit léčbu a zahájit sledování",
        targetLabel: "Sledování",
        description: "Uzavře primární léčbu a založí dispenzární kontrolu.",
      };
    case "Recidiva":
      return {
        label: "Zahájit restaging",
        targetLabel: "Staging",
        description: "Otevře nový staging a následné rozhodnutí MDT pro recidivu.",
      };
    case "Paliace":
    case "Sledování":
      return null;
  }
}

function getWorkflowTransitionPlan(
  patient: Patient,
  input: WorkflowAdvanceInput,
): WorkflowTransitionPlan | null {
  switch (patient.phase) {
    case "Příjem":
      if (patient.biopsyStatus !== "Nutno provést") {
        return {
          nextPhase: "Staging",
          progress: 40,
          nextStep: "Dokončit stagingová vyšetření",
          nextStepDelayDays: 7,
          eventKind: "intake",
          eventTitle: "Příjem dokončen — pokračování do stagingu",
          eventDescription:
            "Příjem byl dokončen. Doložená biopsie se neopakuje a pacient pokračuje do stagingu.",
        };
      }
      return {
        nextPhase: "Biopsie",
        progress: 20,
        nextStep: "Biopsie / histologická verifikace",
        nextStepDelayDays: 7,
        eventKind: "intake",
        eventTitle: "Příjem pacienta dokončen",
        eventDescription:
          "Identifikace a diagnóza byly doplněny. Dalším krokem je histologická verifikace.",
      };
    case "Biopsie": {
      if (!input.biopsyStatus) return null;
      const external = input.biopsyStatus === "Provedena externě";
      if (
        !input.biopsyResult?.date ||
        !input.biopsyResult.facility.trim() ||
        !input.biopsyResult.conclusion.trim()
      ) {
        return null;
      }
      return {
        nextPhase: "Staging",
        progress: 40,
        nextStep: "Dokončit stagingová vyšetření",
        nextStepDelayDays: 7,
        eventKind: "pathology",
        eventTitle: external ? "Externí biopsie doložena" : "Biopsie dokončena v ÚVN",
        eventDescription: `${input.biopsyResult.facility}: ${input.biopsyResult.conclusion}${
          input.biopsyResult.reportReference
            ? ` Reference nálezu: ${input.biopsyResult.reportReference}.`
            : ""
        } Pacient pokračuje do stagingu.`,
        changes: {
          biopsyStatus: input.biopsyStatus,
          biopsyResult: input.biopsyResult,
          diagnosisCertainty: "Histologicky potvrzená",
        },
      };
    }
    case "Staging": {
      const examinations = Array.from(
        new Set(input.stagingExaminations.map((item) => item.trim()).filter(Boolean)),
      );
      if (examinations.length === 0) return null;
      return {
        nextPhase: "MDT",
        progress: 65,
        nextStep: "Prezentace na MDT",
        nextStepDelayDays: 7,
        eventKind: "imaging",
        eventTitle: "Staging dokončen",
        eventDescription: `Stagingová vyšetření byla uzavřena: ${examinations.join(
          ", ",
        )}. Případ je připraven k prezentaci na MDT.`,
        changes: {
          stagingExaminations: examinations,
        },
      };
    }
    case "MDT": {
      if (!input.treatmentRoute) return null;
      const routeDetails: Record<
        TreatmentRoute,
        Pick<WorkflowTransitionPlan, "nextStep" | "nextStepDelayDays" | "eventDescription">
      > = {
        "Primární operace": {
          nextStep: "Naplánovat operační výkon",
          nextStepDelayDays: 14,
          eventDescription: "MDT doporučil primární operační léčbu.",
        },
        "Neoadjuvantní léčba": {
          nextStep: "Zahájit neoadjuvantní léčbu",
          nextStepDelayDays: 7,
          eventDescription:
            "MDT doporučil neoadjuvantní léčbu s následným posouzením operačního výkonu.",
        },
        Paliace: {
          nextStep: "Zahájit paliativní plán péče",
          nextStepDelayDays: 7,
          eventDescription: "MDT doporučil individuální plán paliativní péče.",
        },
      };
      const details = routeDetails[input.treatmentRoute];
      return {
        nextPhase: input.treatmentRoute,
        progress: 80,
        nextStep: details.nextStep,
        nextStepDelayDays: details.nextStepDelayDays,
        eventKind: "mdt",
        eventTitle: `Rozhodnutí MDT — ${input.treatmentRoute}`,
        eventDescription: details.eventDescription,
        changes: {
          mdtDate: input.date,
          treatmentRoute: input.treatmentRoute,
          treatmentSite: null,
        },
      };
    }
    case "Neoadjuvantní léčba":
      return {
        nextPhase: "Primární operace",
        progress: 90,
        nextStep: "Naplánovat operační výkon",
        nextStepDelayDays: 14,
        eventKind: "systemic",
        eventTitle: "Neoadjuvantní léčba dokončena",
        eventDescription:
          "Neoadjuvantní léčba byla uzavřena. Pacient pokračuje k operační léčbě.",
      };
    case "Primární operace":
      return {
        nextPhase: "Sledování",
        progress: 100,
        nextStep: "Dispenzární kontrola",
        nextStepDelayDays: 90,
        eventKind: "surgery",
        eventTitle: "Primární léčba dokončena",
        eventDescription:
          "Operační léčba byla uzavřena. Pacient přechází do dispenzárního sledování.",
      };
    case "Recidiva":
      return {
        nextPhase: "Staging",
        progress: 40,
        nextStep: "Dokončit restagingová vyšetření",
        nextStepDelayDays: 7,
        eventKind: "recurrence",
        eventTitle: "Restaging při recidivě zahájen",
        eventDescription:
          "Byl zahájen nový stagingový cyklus pro posouzení recidivy a další rozhodnutí MDT.",
        changes: {
          stagingExaminations: [],
          mdtDate: null,
          treatmentRoute: null,
          treatmentSite: null,
        },
      };
    case "Paliace":
    case "Sledování":
      return null;
  }
}

export function advancePatientThroughWorkflow(patient: Patient, input: WorkflowAdvanceInput) {
  if (!input.date) return null;
  const plan = getWorkflowTransitionPlan(patient, input);
  if (!plan) return null;

  const note = input.note.trim();
  const eventDate =
    patient.phase === "Biopsie" && input.biopsyResult
      ? input.biopsyResult.date
      : input.date;
  const event: TimelineEvent = {
    id: `event-${Date.now()}-transition`,
    kind: plan.eventKind,
    date: eventDate,
    title: plan.eventTitle,
    description: `${plan.eventDescription}${note ? ` Poznámka: ${note}` : ""}`,
    author: "Andrej Demo",
    status: "Dokončeno",
  };

  return {
    ...patient,
    ...plan.changes,
    phase: plan.nextPhase,
    progress: plan.progress,
    nextStep: plan.nextStep,
    nextStepDate: addDays(input.date, plan.nextStepDelayDays),
    events: [event, ...patient.events],
  } satisfies Patient;
}
