# OnkoFlow — oncology care registry mockup

Interactive Czech-language mockup for tracking patients through an oncologic care pathway. It demonstrates:

- a clinical operations dashboard;
- searchable synthetic patient records;
- responsive, touch-friendly desktop and mobile workflows;
- a chronological care timeline;
- upcoming and overdue tasks;
- an audit-log concept;
- a working **Přijetí pacienta do péče** form with Czech birth-number date parsing and MKN-10 selection;
- the clinical pathway **Příjem → Biopsie → Staging → MDT**, followed by primary surgery, neoadjuvant treatment with subsequent surgery, or palliation;
- guided one-action phase transitions that update the patient state, next task, progress, and clinical timeline together;
- biopsy-origin recording so a biopsy already completed at ÚVN or externally is not repeated;
- structured biopsy results from ÚVN or an external facility (date, workplace, report reference, and conclusion);
- a selectable staging checklist with custom examinations, plus a separate recurrence state;
- patient-scoped creation of planned events that also appear in **Úkoly a termíny**.

## Important

This repository is a **front-end mockup only**. It has no database, API, authentication, or compliant medical-record storage. All bundled records are fictitious. Do not enter real patient data.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Production direction

Before handling real records, replace the in-memory demo state with an institutionally approved backend, hospital SSO/MFA, role-based authorization, encrypted identifiers, append-only clinical history, comprehensive audit logging, tested backups, and the required privacy/security governance.
