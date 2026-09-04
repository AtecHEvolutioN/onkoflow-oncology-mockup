# OnkoFlow production-readiness gates

OnkoFlow 0.8.0 is an operational folder-backed build. Application-level persistence
is implemented, but this repository alone does not constitute hospital approval for
processing real patient data.

## Implemented in 0.8.0

- Explicit selection of the `OnkoFlow\data` directory.
- Read/write permission must be granted before the application opens.
- The shared password is compared as a SHA-256 digest and is never stored in the
  selected directory or browser settings.
- Only the directory handle is retained in browser IndexedDB.
- The installed PWA caches only application assets for offline use.
- Patient records use UUID filenames, schema version 2, numeric revisions and verified
  write/read-back.
- The patient directory supports diagnosis and MDT-date search, including one-click
  grouping of all patients assigned to a selected MDT date.
- The dashboard prioritizes actionable and overdue work, exposes upcoming dates and
  keeps patient search available from every main view.
- MDT records include structured operation, histology, follow-up, oncology, performance,
  NOR, recommendation and attendance fields.
- The major phase after MDT is always `Terapie`; primary operation, neoadjuvant treatment
  and palliation are stored and displayed as treatment modifiers. Legacy records are
  normalized when loaded.
- Every update creates a pre-update backup and a separate immutable audit event.
- The application starts with an empty registry and does not load seeded patients.
- User identity is not captured or verified; prototype actions use the generic label
  `Uživatel oddělení`.

The shared password is only a deterrent against accidental access. Because all
client-side application code is delivered to the workstation, it cannot provide
secure authentication by itself.

## Required organizational gates

1. **Hospital identity** — authenticate through an IT-managed server using the
   hospital directory/SSO. The server may then supply the verified Windows identity;
   a browser-only PWA cannot read the signed-in Windows username.
2. **Authorization** — define roles and least-privilege access for physicians,
   coordinators, administrators and read-only users.
3. **Approved hosting and updates** — use hospital-approved internal HTTPS or an
   approved managed deployment. Pin, sign and test releases before promotion.
4. **Concurrent access** — validate multi-workstation behavior on the real SMB share.
   Browser file APIs cannot guarantee a server-grade atomic compare-and-swap operation.
5. **Audit identity** — record verified identity, UTC timestamp, workstation/session,
   action, patient UUID and result. Protect the audit trail from alteration.
6. **Data protection** — complete DPIA/security review, retention rules, encryption
   assessment, access-control review and data-minimization review for rodné číslo.
7. **Recovery** — implement tested backups, restore drills, integrity checks and
   documented recovery time/recovery point objectives.
8. **Clinical validation** — approve workflow definitions, MKN data source, required
   fields, terminology and error handling with named clinical owners.
9. **Operational validation** — test offline startup, folder loss, revoked permission,
    full disk, SMB outage, two-workstation collision, interrupted write and upgrade/
    rollback on managed ÚVN workstations.

Clinical rollout requires named owners, documented evidence and formal approval for
the remaining gates.
