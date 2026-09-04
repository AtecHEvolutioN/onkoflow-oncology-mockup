# OnkoFlow — GYN oncology care registry

Czech-language departmental registry for tracking patients through an oncologic care pathway. Version 0.8.0 provides:

- a clinical operations dashboard;
- an urgency-ranked action queue, date-first status indicators and an operational patient table;
- a permanently available patient search in the application header;
- an empty registry on first use with searchable patient records;
- responsive, touch-friendly desktop and mobile workflows;
- a chronological care timeline;
- upcoming and overdue tasks;
- immutable file-based audit events for persisted changes;
- a working **Přijetí pacienta do péče** form with Czech birth-number date parsing and MKN-10 selection;
- the clinical pathway **Příjem → Biopsie → Staging → MDT → Terapie**, with waiting states calculated dynamically inside each stage;
- treatment strategies stored as modifiers of **Terapie**, never as separate major workflow stages;
- guided one-action phase transitions that update the patient state, next task, progress, and clinical timeline together;
- biopsy-origin recording so a biopsy already completed at ÚVN or externally is not repeated;
- structured biopsy results from ÚVN or an external facility (date, workplace, report reference, and conclusion);
- a selectable staging checklist with custom examinations, plus a separate recurrence state;
- editable staging rows with an examination date, conclusion and calculated status;
- direct reopening and editing of previously saved biopsy and staging data;
- an MDT-oriented patient table searchable by diagnosis and MDT date;
- one-click grouping of every patient assigned to the same MDT date;
- a structured MDT record covering operation, histology, follow-up, recommendation and attendees;
- a consolidated MDT evidence list of biopsy, imaging, laboratory examinations and conclusions;
- patient-scoped creation of planned events that also appear in **Úkoly a termíny**.

## Data storage

The app writes versioned patient JSON files to `data/patients`, immutable change events
to `data/audit`, and pre-update copies to `data/backups`. A write is read back before
the UI confirms success. Numeric revisions detect stale edits and duplicate Czech
birth numbers are rejected.

The shared client-side password is not verified user authentication. Deployment with
real patient data still requires formal hospital approval, access controls on the SMB
share, tested backup/restore, and security/privacy governance. See
[production-readiness gates](docs/PRODUCTION-READINESS.md).
The expanded clinical lifecycle is maintained in the
[clinical workflow specification](docs/CLINICAL-WORKFLOW.md).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Offline Windows operation

### Edge PWA mode (no CMD or executable)

For managed workstations that block command files, open the Vercel HTTPS app once
in Microsoft Edge. Version 0.8.0 registers a versioned service worker, precaches the
complete static interface, and exposes a PWA manifest. After the green
`Offline režim připraven` indicator appears, install it from Edge via
**Apps → Install OnkoFlow**. Subsequent launches can use the cached interface without
internet access while File System Access continues to target the user-selected local
or SMB folder.

The client-side password does not capture or verify user identity. A public origin
and automatically updating service worker require hospital security approval before
clinical deployment.

### Portable localhost package (only where policy permits CMD)

The preferred installation route for the **offline departmental build** is
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
application persists records in the selected `data` folder; the diagnostics screen
separately verifies SMB/browser behavior with temporary files. See the exact setup in
[docs/LOCAL-DEPARTMENT-SETUP.md](docs/LOCAL-DEPARTMENT-SETUP.md).

## Checks

```bash
npm run typecheck
npm run lint
npm run test:launcher
npm run test:storage
npm run build
```

## Operational limitations

This release implements folder-backed persistence, validation, revisions, backups and
audit events. The File System Access API does not provide a server-grade transactional
lock across several SMB workstations. Concurrent-write testing and formal hospital
approval remain mandatory before routine clinical use.
