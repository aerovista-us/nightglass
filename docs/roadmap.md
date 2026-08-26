# Nightglass Roadmap

**Product:** Nightglass — Investigation Intelligence Platform  
**Principle:** Nightglass owns investigation state, evidence, provenance, correlation, and reporting. Specialized tools perform collection behind strict adapters.

## Architecture decision

Nightglass remains the case-centric investigation system. ShadowBroker is an optional upstream intelligence provider through its documented HMAC-authenticated command channel. ShadowBroker source is not copied into Nightglass; the integration remains an API/service boundary so Nightglass stays independently maintainable and the AGPL-licensed upstream remains isolated.

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

The reordered build is now materially implemented through TRACE, with GRAPH/RECORDS foundations and the first isolated evidence-capture worker also in place.

| Phase | Priority | Work | Status |
| --- | --- | --- | --- |
| 0 | P0 | Freeze and upgrade core schema/API | **Implemented + legacy-v0.1 migration tested** |
| 1 | P0 | `SIGNAL` ShadowBroker connector | **Implemented + opt-in Compose profile; live provider QA pending** |
| 2 | P0 | Universal normalization layer | **Implemented + tested** |
| 3 | P0 | Evidence/provenance ledger | **Core + isolated snapshot worker implemented; screenshots pending** |
| 4 | P1 | TRACE multi-engine orchestration | **Implemented + smoke tested** |
| 5 | P1 | GRAPH entities + evidence-backed relationships | **Implemented foundation + SIGNAL relationship extraction + provenance inspection** |
| 6 | P1 | RECORDS connector registry | **Registry + first SEC provider implemented; live provider QA pending** |
| 7 | P2 | PULSE watches + ShadowBroker events | Planned |
| 8 | P2 | Investigative dossier/report generation | Planned |
| 9 | Later | Selective GEO through SIGNAL | Deferred |

Current automated coverage includes schema-v2 startup, no-loss migration from a constructed v0.1 database, case creation, canonical subject/entity creation, TRACE scheduling, normalized findings, source provenance, evidence hashing, ShadowBroker HMAC construction, cautious relationship extraction, and capture-worker SSRF policy checks.

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

- SQLite schema v2 with additive migration from the original v0.1 tables.
- Canonical case-scoped `entities` table.
- `sources` provenance table.
- `relationships` + `relationship_sources` tables.
- `audit_log`.
- Job profile/metadata fields.
- Finding normalization/confidence fields.
- Expanded evidence provenance and capture-reference fields.
- Subject-to-canonical-entity linkage.
- CI fixture that constructs a v0.1 database and proves the case/subject data survives schema-v2 startup.

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

- When schema v3 begins, move from free-form additive column checks to explicit ordered migration functions.

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

Nightglass also includes:

- explicit `SHADOWBROKER_ENABLED` gating;
- clean TRACE skip behavior when SIGNAL is disabled;
- `npm run signal:check` capability verification;
- `docs/SIGNAL_SHADOWBROKER.md` runbook;
- an opt-in backend-only Docker Compose `signal` profile using the upstream ShadowBroker image;
- default disabling of unrelated mesh/global telemetry features in that profile.

## Deliberately excluded

Nightglass does **not** expose ShadowBroker subnet-sweep/device-discovery commands. The initial SIGNAL path also excludes the ShadowBroker frontend, global telemetry dumps, aircraft/vessel/satellite tracking, CCTV, SAR, Meshtastic/APRS, InfoNet, Telegram, prediction markets, and unrelated global feeds.

## Remaining

- Run a real Nightglass → ShadowBroker capability check against a deployed backend.
- Verify a live passive lookup through both same-network HMAC and any future cross-host TLS path.
- Pin the production ShadowBroker image to a reviewed release/digest rather than leaving `latest` as the development default.
- Later add selected entity-profile/news functions only when a case workflow actually needs them.

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
- `startJob()` no longer writes provider-specific findings directly to the database.
- Raw and normalized representations are retained.
- Sources receive deterministic provenance hashes.

---

# Phase 3 — LEDGER evidence pipeline

## Goal

Preserve enough context to explain where each finding came from and what the analyst relied on.

## Implemented ledger

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

Audit events are written for case creation, subject creation, job completion/failure, TRACE start, manual evidence creation, and captured evidence creation.

## Implemented isolated capture worker

```text
capture-worker/
├── security.mjs
├── capture.mjs
├── server.mjs
└── Dockerfile
```

The worker is an opt-in Compose profile and has no Nightglass database mount. It enforces:

- explicit analyst capture action;
- HTTP/HTTPS only;
- ports 80/443 only;
- DNS resolution before connection;
- blocking of loopback/private/link-local/multicast/CGNAT and other reserved targets;
- pinned validated address for the actual outbound socket;
- redirect revalidation at every hop;
- response-size and timeout limits;
- text/HTML/JSON content-type allowlist;
- capture token authentication;
- dedicated snapshot volume;
- exact content SHA-256 and independent Nightglass evidence-record SHA-256.

The main Nightglass process only talks to the fixed worker URL; it still does not directly fetch analyst-provided evidence URLs.

See `docs/EVIDENCE_CAPTURE.md`.

## Remaining

- Add a separate browser-rendering/screenshot sidecar if screenshots prove necessary. Do not put a browser runtime in the core worker.
- Add attachment-only snapshot export/download; never inline-render untrusted captured HTML.
- Live-test redirect/DNS behavior against benign controlled URLs.

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

`POST /api/cases/:caseId/trace` returns scheduled jobs and explicit skipped providers. Companion tools are not silently treated as integrated engines. Optional disabled/unconfigured providers are skipped instead of creating predictable failed jobs.

## Remaining

- Build the real SpiderFoot scan adapter before allowing it into orchestration.
- Add job cancellation/retry/concurrency controls before Deep TRACE grows larger.

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

## Implemented

- Canonical entity upsert/deduplication within a case.
- Relationship table with independent confidence and verification fields.
- Relationship-to-source join table.
- Generic normalized relationship persistence path.
- UI graph renders canonical entities/relationships instead of every raw finding as a node.
- SIGNAL DNS results can emit `domain -> resolves_to -> ip`.
- SIGNAL RDAP emits `registered_to` only when the upstream entity explicitly has a registrant role.
- Certificate transparency can emit cautious domain associations.
- IP context can emit low-confidence organization associations.
- Relationship-detail API/UI exposes the edge's source chain, source hash, linked finding, and linked analyst evidence.

## Remaining

- Add more structured relationship extraction only where the upstream semantics are clear.
- Add analyst merge/split controls for ambiguous entity resolution.
- Add explicit conflict handling when sources disagree.
- Add analyst verification/rejection actions on edges.

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

- uses a fixed SEC government endpoint rather than an analyst-controlled URL;
- searches company name/ticker;
- returns CIK/ticker/company findings;
- retains government-source attribution;
- assigns source and match confidence separately;
- requires `SEC_USER_AGENT` before live requests;
- participates in Standard/Deep company TRACE when configured.

## Next providers

Evaluate in this order:

1. SEC submissions/filing enrichment after a high-confidence CIK resolution;
2. state corporate-registration sources with stable/open interfaces;
3. professional-license/open-government datasets;
4. property/permit datasets where lawful and programmatically reliable;
5. court/public-record integrations only where terms and access model are appropriate.

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

- watches are explicit and case-scoped;
- unchanged events deduplicate;
- every alert retains provider/event provenance;
- operators can disable a watch without deleting its history.

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

- loopback/private-network exposure by default;
- no arbitrary command execution;
- no arbitrary provider URLs in the main app;
- connector allowlists;
- outbound timeouts and result caps;
- environment/secret-manager credentials only;
- significant case mutations audited;
- SSO becomes mandatory before multi-user/external exposure.

## Legal/ethical boundary

Nightglass is for lawful, authorized fraud prevention, compliance, due diligence, security, and investigative workflows. It must not be designed for harassment, stalking, doxxing, impersonation, unauthorized access, or bypassing access controls.

## Licensing

ShadowBroker is AGPL-3.0. Keep the integration at an external service/API boundary. Do not copy ShadowBroker implementation source into Nightglass. Preserve upstream attribution and evaluate AGPL obligations before distributing a modified ShadowBroker service.

---

# Next execution queue

With Phases 0–4 implemented and Phases 5–6 underway, continue in this order:

1. **Live SIGNAL QA** — start the opt-in ShadowBroker profile and verify capability + passive lookup/HMAC path.
2. **Live capture QA** — start the capture profile and verify public-target capture, redirect handling, and blocked-private-target behavior.
3. **GRAPH controls** — analyst verify/reject plus merge/split/conflict handling.
4. **RECORDS expansion** — SEC submissions enrichment after strong CIK resolution, then next authoritative provider.
5. **SpiderFoot adapter** — only then allow it into Deep TRACE.
6. **Operational controls** — job retry/cancel/concurrency and retention policy.
7. **SSO/RBAC** — before Nightglass becomes multi-user or remotely exposed.
8. **PULSE** — explicit entity watches and ShadowBroker event ingestion.
9. **Dossier generator** — evidence-linked TLO-style investigative case reports.
10. **GEO** — remain deferred until case workflows show a clear need.
