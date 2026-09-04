# OnkoFlow — oncology care registry mockup

Interactive Czech-language mockup for tracking patients through an oncologic care pathway. It demonstrates:

- a clinical operations dashboard;
- searchable synthetic patient records;
- responsive, touch-friendly desktop and mobile workflows;
- a chronological care timeline;
- upcoming and overdue tasks;
- an audit-log concept;
- a working **Přijetí pacienta do péče** form with Czech birth-number date parsing and MKN-10 selection;
- the clinical pathway **Příjem → Biopsie → čekání na histologii → Staging → čekání na výsledky → MDT → čekání na zahájení léčby**, followed by primary surgery, neoadjuvant treatment with subsequent surgery, or palliation;
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

## Offline Windows storage proof-of-concept

### Edge PWA mode (no CMD or executable)

For managed workstations that block command files, open the Vercel HTTPS mockup once
in Microsoft Edge. Version 0.5.2 registers a versioned service worker, precaches the
complete static interface, and exposes a PWA manifest. After the green
`Offline režim připraven` indicator appears, install it from Edge via
**Apps → Install OnkoFlow**. Subsequent launches can use the cached interface without
internet access while File System Access continues to target the user-selected local
or SMB folder.

This is still a diagnostic proof of concept. Do not enter real patient data. A public
origin and automatically updating service worker require hospital security approval
before any clinical deployment.

Version 0.5.2 adds a pilot password gate and mandatory selection of the `data`
directory. It does not capture or verify user identity. The client-side shared
password is not production authentication. See the mandatory
[production-readiness gates](docs/PRODUCTION-READINESS.md).

### Portable localhost package (only where policy permits CMD)

The preferred installation route for the **offline department diagnostic build** is
the self-contained Windows ZIP on the
[latest GitHub Release](https://github.com/AtecHEvolutioN/onkoflow-oncology-mockup/releases/latest).
GitHub Actions rebuilds and publishes a new, commit-labelled ZIP after every update
to `main`. Download the asset named `OnkoFlow-offline-Windows-...zip`, extract the
whole package locally, and double-click `Start-OnkoFlow.cmd`. The bundled official
Node.js runtime serves the static application only on `127.0.0.1:8787` and opens
Edge. No internet connection, Git, Node.js installation, or PowerShell is required
at runtime. The ZIP never contains the separate `data` folder.

The same build can be created locally as a fallback:

```bash
npm run build:department
```

It creates `out/`, which still needs to be served from a trustworthy local origin;
double-clicking `out/index.html` is not supported in the tested ÚVN Edge setup. The
diagnostics screen tests the browser/SMB environment with temporary synthetic files;
it does **not** persist patient records. See the exact Czech setup and stop conditions in
[docs/LOCAL-DEPARTMENT-SETUP.md](docs/LOCAL-DEPARTMENT-SETUP.md).

## Checks

```bash
npm run typecheck
npm run lint
npm run test:launcher
npm run build
```

## Production direction

Before handling real records, the departmental SMB diagnostics must pass on the
actual ÚVN Edge workstations. Only then should the UI be migrated incrementally to
versioned per-patient records, optimistic concurrency, immutable audit events,
integrity checks, tested backups, and the required privacy/security governance.
