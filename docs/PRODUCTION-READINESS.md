# OnkoFlow production-readiness gates

OnkoFlow 0.5.1 is a pilot interface and storage-connectivity proof of concept. It is
not approved for real patient data. The following gates must all be completed before
clinical use.

## Current 0.5.1 safeguards

- Explicit user identification at every application start.
- Explicit selection of the `OnkoFlow\data` directory.
- Read/write permission must be granted before the application opens.
- The shared password is compared as a SHA-256 digest and is never stored in the
  selected directory or browser settings.
- Directory handles, but no patient records, are retained in browser IndexedDB.
- The installed PWA caches only application assets for offline use.
- Patient filenames are not yet implemented; the current application still uses
  synthetic in-memory records.

The shared password is only a deterrent against accidental access. Because all
client-side application code is delivered to the workstation, it cannot provide
secure authentication by itself.

## Required gates before patient data

1. **Hospital identity** — authenticate through an IT-managed server using the
   hospital directory/SSO. The server may then supply the verified Windows identity;
   a browser-only PWA cannot read the signed-in Windows username.
2. **Authorization** — define roles and least-privilege access for physicians,
   coordinators, administrators and read-only users.
3. **Approved hosting and updates** — use hospital-approved internal HTTPS or an
   approved managed deployment. Pin, sign and test releases before promotion.
4. **Persistent data layer** — implement UUID-based patient directories, validated
   schemas, atomic writes, append-only clinical events and explicit schema migration.
5. **Concurrent access** — implement numeric revisions, optimistic concurrency and a
   visible conflict-resolution workflow; never silently overwrite another user's work.
6. **Audit trail** — record verified identity, UTC timestamp, workstation/session,
   action, patient UUID and result. Protect the audit trail from alteration.
7. **Data protection** — complete DPIA/security review, retention rules, encryption
   assessment, access-control review and data-minimization review for rodné číslo.
8. **Recovery** — implement tested backups, restore drills, integrity checks and
   documented recovery time/recovery point objectives.
9. **Clinical validation** — approve workflow definitions, MKN data source, required
   fields, terminology and error handling with named clinical owners.
10. **Operational validation** — test offline startup, folder loss, revoked permission,
    full disk, SMB outage, two-workstation collision, interrupted write and upgrade/
    rollback on managed ÚVN workstations.

The application must remain in synthetic-data mode until all gates have named owners,
documented evidence and formal approval.
