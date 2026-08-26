# Nightglass Roadmap

**Product:** Nightglass — Investigation Intelligence Platform  
**Principle:** Nightglass owns investigation state, evidence, provenance, correlation, and reporting. Specialized tools perform collection behind strict adapters.

## Architecture decision

Nightglass remains the case-centric investigation system. ShadowBroker is an optional upstream intelligence provider through its documented HMAC-authenticated command channel. ShadowBroker source is not copied into Nightglass; the integration remains an API boundary so Nightglass stays independently maintainable and the AGPL-licensed upstream remains isolated.

```text
                    NIGHTGLASS
             Investigation Intelligence
                       │
        ┌──────────────┼───────────────┐
        │              │               │
      CASES           TRACE           GRAPH
        │              │               │
        │        ┌─────┴────────┐      │
        │        │              │      │
        │     Sherlock        Holehe   │
        │        │              │      │
        │        ├─ SpiderFoot ─┤      │
        │        │              │      │
        │        └─ SIGNAL ─────┘      │
        │             │                │
        │        ShadowBroker          │
        │             │                │
        └─────────────┼────────────────┘
                      ▼
              Normalized Findings
                      │
                 LEDGER
             Evidence + Provenance
```

## Implementation checkpoint — 2026-08-25

The reordered build has moved beyond planning. The core implementation through TRACE is now in the repository and the expanded CI smoke path passes.

| Phase | Priority | Work | Status |
| --- | --- | --- | --- |
| 0 | P0 | Freeze and upgrade core schema/API | **Implemented; legacy-v0.1 migration fixture still needed** |
| 1 | P0 | `SIGNAL` ShadowBroker connector | **Implemented; live ShadowBroker QA pending** |
| 2 | P0 | Universal normalization layer | **Implemented + tested** |
| 3 | P0 | Evidence/provenance ledger | **Core implemented; isolated capture worker remains** |
| 4 | P1 | TRACE multi-engine orchestration | **Implemented + smoke tested** |
| 5 | P1 | GRAPH entities + evidence-backed relationships | **Storage/UI foundation implemented; richer extraction remains** |
| 6 | P1 | RECORDS connector registry | **Registry + first SEC provider implemented; live provider QA pending** |
| 7 | P2 | PULSE watches + ShadowBroker events | Planned |
| 8 | P2 | Investigative dossier/report generation | Planned |
| 9 | Later | Selective GEO through SIGNAL | Deferred |

The passing smoke path now covers schema v2 startup, case creation, canonical subject/entity creation, Standard TRACE scheduling, normalized findings, source provenance, and evidence hashing.

---

# Phase 0 — Foundation lock

## Goal

Use one stable investigation vocabulary:

```text
CASE
 ├── SUBJECT
 ├── ENTITY
 ├── FINDING
 ├── RELATIONSHIP
 ├── SOURCE
 ├── EVIDENCE
 └── JOB
```

## Implemented

- SQLite schema v2 with additive migration columns.
- Canonical case-scoped `entities` table.
- `sources` provenance table.
- `relationships` + `relationship_sources` tables.
- `audit_log`.
- Job profile/metadata fields.
- Finding normalization/confidence fields.
- Expanded evidence provenance fields.
- Subject-to-canonical-entity linkage.

## Confidence model

Nightglass stores distinct dimensions rather than one unexplained score:

- `source_confidence`
- `match_confidence`
- `correlation_confidence`
- `freshness`
- `verification_status`

Verification states are intended to include:

```text
unverified
observed
corroborated
conflicting
rejected
```

## Remaining

- Add a CI fixture that starts from an actual v0.1 database and verifies the schema-v2 migration without data loss.
- Add explicit schema version migration functions once schema v3 begins rather than letting additive migrations grow indefinitely.

---

# Phase 1 — NIGHTGLASS // SIGNAL

## Goal

Use ShadowBroker as an optional intelligence provider, not as a fork or embedded codebase.

## Implemented connector

```text
src/engines/shadowbroker/
├── auth.mjs
├── capabilities.mjs
├── client.mjs
├── normalize.mjs
└── index.mjs
```

Nightglass implements ShadowBroker's body-bound signing model:

```text
HMAC-SHA256(secret, METHOD|path|timestamp|nonce|sha256(body))
```

Initial allowlisted passive lookups:

- DNS
- WHOIS / RDAP
- certificate transparency
- IP intelligence
- sanctions search
- GitHub account enrichment
- leak/breach presence

Configuration:

```text
SHADOWBROKER_URL=http://127.0.0.1:8000
SHADOWBROKER_HMAC_SECRET=
SHADOWBROKER_TIMEOUT_MS=15000
```

## Deliberately excluded

Nightglass does **not** expose ShadowBroker subnet sweep/device discovery commands. The first SIGNAL integration also leaves global telemetry, aircraft, ships, satellites, CCTV, SAR, Meshtastic/APRS, InfoNet, Telegram, markets, and the ShadowBroker frontend outside the Nightglass runtime.

## Remaining

- Run a real Nightglass → ShadowBroker test against a deployed backend.
- Verify local unsigned mode and remote HMAC mode.
- Add provider health/capability status to the Nightglass UI.
- Later add selected `find_entity`, entity profile, and news functionality when case workflows justify it.

---

# Phase 2 — Universal normalization

## Goal

All collectors terminate in one Nightglass shape.

```json
{
  "entity": {},
  "finding": {},
  "relationships": [],
  "source": {},
  "confidence": {
    "source": 0.0,
    "match": 0.0,
    "correlation": 0.0,
    "freshness": 0.0
  },
  "verificationStatus": "unverified",
  "raw": {}
}
```

## Implemented

- Universal `normalizeFinding()` path.
- Existing Sherlock/Holehe/simple engine records remain compatible.
- ShadowBroker results enter the same path.
- RECORDS results enter the same path.
- `startJob()` no longer writes raw engine-specific findings directly.
- Raw and normalized representations are retained.

---

# Phase 3 — LEDGER evidence pipeline

## Goal

Preserve enough context to explain where each finding came from and what the analyst relied on.

## Implemented

Each finding can now retain or link:

```text
Case ID
Finding ID
Source ID
Provider
Source URL
Query used
Retrieved timestamp
Raw provider response
Normalized response
Source SHA-256
Confidence dimensions
Verification state
```

Manual evidence records additionally support:

```text
Finding/source linkage
Provider
Query/raw/normalized metadata
Headers metadata
Optional content SHA-256
Canonical evidence SHA-256
Analyst notes
Verification state
```

Audit events are written for case creation, subject creation, job completion/failure, TRACE start, and evidence creation.

## Next: isolated capture worker

The main Nightglass process will **not** become an arbitrary URL fetcher. Web capture belongs in a separate worker with:

- explicit analyst action
- DNS/IP resolution checks
- private/link-local/loopback blocking
- redirect re-validation
- scheme/port allowlists
- response-size/time limits
- HTML snapshot
- screenshot
- response headers
- content SHA-256

---

# Phase 4 — TRACE orchestration

## Goal

Move from individual tool buttons to investigation profiles.

Implemented profiles:

```text
QUICK TRACE
STANDARD TRACE
DEEP TRACE
```

Current routing:

| Target | Quick | Standard | Deep |
| --- | --- | --- | --- |
| email | Holehe + SIGNAL | Holehe + SIGNAL | Holehe + SIGNAL + SpiderFoot when adapter exists |
| username | Sherlock + SIGNAL | Sherlock + SIGNAL | Sherlock + SIGNAL + SpiderFoot when adapter exists |
| domain | SIGNAL | SIGNAL | SIGNAL + SpiderFoot when adapter exists |
| IP | SIGNAL | SIGNAL | SIGNAL |
| company | SIGNAL | SIGNAL + SEC RECORDS | SIGNAL + SEC RECORDS |
| person | SIGNAL | SIGNAL | SIGNAL |

`POST /api/cases/:caseId/trace` returns scheduled jobs and explicit skipped providers. Companion tools are not silently treated as integrated engines, and providers missing required live configuration are skipped with a reason.

## Remaining

- Build the real SpiderFoot scan adapter before adding it to orchestration.
- Add job cancellation/retry and concurrency limits before Deep TRACE grows larger.

---

# Phase 5 — GRAPH

## Goal

Make relationships evidence-backed investigation objects, not decorative lines.

Canonical entity direction:

```text
person
email
phone
username
domain
ip
company
address
account
document
vehicle
aircraft
vessel
```

Relationship vocabulary starts with:

```text
uses
owns
registered_to
works_for
resolves_to
associated_with
shares
mentioned_with
located_at
observed_at
```

## Implemented foundation

- Canonical entity upsert/deduplication within a case.
- Relationship table with independent confidence and verification fields.
- Relationship-to-source join table.
- Generic normalized relationship persistence path.
- UI graph now renders canonical entities/relationships instead of every raw finding as a node.

## Remaining

- Teach provider normalizers to emit specific relationships from structured results.
- Add relationship evidence inspection in the UI.
- Add analyst merge/split controls for ambiguous entity resolution.
- Add conflict handling when two sources disagree.

---

# Phase 6 — RECORDS

## Goal

Add authoritative/public-record sources that SIGNAL does not replace.

## Implemented

Provider registry:

```text
src/records/registry.mjs
```

First provider:

```text
U.S. SEC Company Directory
```

The SEC connector:

- uses a fixed SEC government endpoint rather than an analyst-controlled URL
- searches company name/ticker
- returns CIK/ticker/company findings
- retains government-source attribution
- assigns source and match confidence separately
- requires `SEC_USER_AGENT` before live requests
- participates in Standard/Deep company TRACE when configured

## Next providers

Evaluate in this order:

1. state corporate-registration sources with stable/open interfaces
2. SEC filing/submission enrichment from a resolved CIK
3. professional-license/open-government datasets
4. property/permit datasets where lawful and programmatically reliable
5. court/public-record integrations only where terms and access model are appropriate

Do not normalize a fuzzy name match into a verified identity without corroboration.

---

# Phase 7 — PULSE

## Goal

Turn selected case entities into explicit watches after the investigation pipeline is mature.

```text
Provider update
      ↓
PULSE
      ↓
watched entity match?
      ↓ yes
new finding
      ↓
correlate
      ↓
ledger + alert
```

Use ShadowBroker SSE/event support selectively rather than polling the whole telemetry surface.

Completion requirements:

- watches are explicit and case-scoped
- unchanged events deduplicate
- every alert retains provider/event provenance
- operators can disable a watch without deleting its history

---

# Phase 8 — Investigative dossier/report layer

## Goal

Produce a defensible case dossier rather than a pile of screenshots.

```text
NIGHTGLASS INVESTIGATIVE DOSSIER

Case Summary
Scope / Authorization
Subjects
Known Identifiers
Organizations
Digital Footprint
Infrastructure
Relationships
Chronology
Public Records
Risk Indicators
Contradictions / Anomalies
Unverified Leads
Evidence Index
Source Provenance
Confidence Assessment
```

Report statements must be classifiable as:

```text
FACT
CORROBORATED FINDING
LIKELY
INFERENCE
LEAD
CONFLICTING
UNVERIFIED
```

Planned exports: JSON, CSV, HTML and PDF dossier.

---

# Phase 9 — GEO remains deferred

Nightglass will not initially ingest a planet-scale OpenStreetMap/PostGIS/Overpass stack.

When geographic analysis is justified:

```text
Nightglass case
      ↓
case-relevant entities/events
      ↓
SIGNAL / ShadowBroker
      ↓
GRAPH | TIMELINE | MAP
```

This keeps the core compact while preserving a later path to geographic intelligence.

---

# Cross-cutting requirements

## Security

- loopback/private-network exposure by default
- no arbitrary command execution
- no arbitrary provider URLs in the main app
- connector allowlists
- outbound timeouts and result caps
- environment/secret-manager credentials only
- significant case mutations audited
- SSO becomes mandatory before multi-user/external exposure

## Legal/ethical boundary

Nightglass is for lawful, authorized fraud prevention, compliance, due diligence, security, and investigative workflows. It must not be designed for harassment, stalking, doxxing, impersonation, unauthorized access, or bypassing access controls.

## Licensing

ShadowBroker is AGPL-3.0. Keep the integration at an external service/API boundary. Do not copy ShadowBroker implementation source into Nightglass. Preserve upstream attribution and evaluate AGPL obligations before distributing a modified ShadowBroker service.

---

# Next execution queue

With Phases 0–4 substantially implemented, continue in this order:

1. **Live SIGNAL QA** — deploy/connect ShadowBroker and test passive lookup + HMAC paths.
2. **Legacy migration test** — construct a v0.1 SQLite fixture and prove schema-v2 no-loss upgrade in CI.
3. **GRAPH enrichment** — emit relationships from structured SIGNAL/RECORDS results and expose provenance on graph edges.
4. **LEDGER capture worker** — isolated snapshot/screenshot worker with SSRF protections.
5. **RECORDS expansion** — add the next authoritative provider after SEC.
6. **SpiderFoot adapter** — only then allow it into Deep TRACE.
7. **Operational controls** — job retry/cancel/concurrency and retention policy.
8. **SSO/RBAC** — before Nightglass becomes multi-user or remotely exposed.
9. **PULSE** — explicit entity watches and ShadowBroker event ingestion.
10. **Dossier generator** — evidence-linked TLO-style investigative case reports.
11. **GEO** — remain deferred until case workflows show a clear need.
