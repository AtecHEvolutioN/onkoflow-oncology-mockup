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
- biopsy-origin recording so a biopsy already completed at ÚVN or externally is not repeated;
- structured capture of an external biopsy result (date, facility, report reference, and conclusion), plus a separate recurrence state.

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
