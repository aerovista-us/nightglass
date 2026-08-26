# Nightglass Roadmap

**Product:** Nightglass — Investigation Intelligence Platform  
**Principle:** Nightglass owns investigation state, evidence, provenance, correlation, and reporting. Specialized tools perform collection behind strict adapters.

## Architecture decision

Nightglass remains the case-centric investigation system. ShadowBroker is integrated as an optional upstream intelligence provider through its documented HMAC-authenticated command channel. ShadowBroker source is not copied into Nightglass; the integration remains an API boundary so Nightglass stays independently maintainable and the AGPL-licensed upstream remains isolated.

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

## New build order

| Phase | Priority | Work | Status |
| --- | --- | --- | --- |
| 0 | P0 | Freeze and upgrade the Nightglass core schema/API | **In progress** |
| 1 | P0 | Build `SIGNAL` ShadowBroker connector | **In progress** |
| 2 | P0 | Universal normalization layer | **In progress** |
| 3 | P0 | Strengthen evidence/provenance ledger | Next |
| 4 | P1 | TRACE multi-engine orchestration | Next |
| 5 | P1 | GRAPH entity resolution + evidence-backed relationships | Planned |
| 6 | P1 | RECORDS connector registry | Planned |
| 7 | P2 | PULSE watches + ShadowBroker SSE/event integration | Planned |
| 8 | P2 | Investigative dossier/report generation | Planned |
| 9 | Later | GEO through selective ShadowBroker data, not a local planet stack | Deferred |

---

# Phase 0 — Foundation lock

## Goal

Establish one stable Nightglass vocabulary before adding more collectors.

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

## Required schema behavior

- Every collection job belongs to a case.
- A subject is the analyst-provided starting point.
- An entity is a canonicalized identity or object discovered or supplied during the case.
- Findings are assertions/results produced by an engine.
- Sources record where a finding came from and preserve raw provider output.
- Relationships connect canonical entities and carry their own confidence and provenance.
- Evidence records preserve analyst-reviewed material and tamper-evident hashes.
- Jobs retain engine, target, status, profile, errors, and timestamps.
- Existing v0.1 databases must migrate additively without destructive resets.

## Confidence model

Do not collapse confidence into one unexplained number. Store distinct dimensions:

- `source_confidence`
- `match_confidence`
- `correlation_confidence`
- `freshness`
- `verification_status`

Suggested verification states:

```text
unverified
observed
corroborated
conflicting
rejected
```

## Completion criteria

- Additive schema migration works against a v0.1 database.
- Findings continue to render through the current API.
- Canonical entities can be created/upserted without duplicates inside a case.
- Source/provenance records can be attached to findings.

---

# Phase 1 — NIGHTGLASS // SIGNAL

## Goal

Integrate ShadowBroker as an optional intelligence provider, not as a fork or embedded codebase.

## Connector layout

```text
src/engines/shadowbroker/
├── auth.mjs
├── capabilities.mjs
├── client.mjs
├── normalize.mjs
└── index.mjs
```

## Initial passive capabilities

Bring in only investigation-relevant passive lookups:

- DNS
- RDAP / WHOIS
- certificate transparency
- IP intelligence
- ASN / BGP
- sanctions
- CVE context
- GitHub account enrichment
- leak/breach presence
- entity lookup/profile later
- news search later

## Explicitly excluded from the first integration

- subnet sweep / device discovery
- aircraft tracking
- vessels
- satellites
- CCTV
- SAR
- Meshtastic / APRS
- InfoNet
- Telegram feeds
- prediction markets
- financial feeds
- global telemetry dumps
- ShadowBroker frontend

These may be useful later, but they are not required to prove Nightglass's investigation workflow.

## Connection model

```text
Nightglass
    │
    │ HMAC-signed HTTP
    ▼
ShadowBroker backend
    │
    └── passive OSINT commands
```

Configuration:

```text
SHADOWBROKER_URL=http://127.0.0.1:8000
SHADOWBROKER_HMAC_SECRET=
SHADOWBROKER_TIMEOUT_MS=15000
```

When deployed in containers, use a private network/service URL and do not expose ShadowBroker's backend publicly.

## Completion criteria

- Connector is optional and fails closed when unavailable.
- Requests use ShadowBroker's documented body-bound HMAC-SHA256 signing.
- Only allowlisted passive command/tool combinations are reachable from Nightglass.
- Raw responses are preserved for provenance.
- No active subnet sweep is exposed through Nightglass.

---

# Phase 2 — Universal normalization

## Goal

All engines produce the same internal shape regardless of upstream tool.

Target normalized record:

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

Engines covered:

- Sherlock
- Holehe
- SpiderFoot when orchestration lands
- ShadowBroker
- future RECORDS connectors
- future uploaded-document extraction

## Completion criteria

- `startJob()` no longer writes engine-specific shapes directly to the database.
- Every stored finding receives normalized confidence/provenance fields.
- Existing simple engine output remains backward compatible.

---

# Phase 3 — LEDGER evidence pipeline

## Goal

Make provenance a first-class Nightglass capability before increasing source count.

Every important finding should be able to preserve:

```text
Case ID
Finding ID
Source ID
Provider
Source URL
Query used
Retrieved timestamp
Raw response
Normalized response
SHA-256 record hash
Investigator/actor
Confidence dimensions
Verification state
Notes
Parent finding / relationship context
```

Future isolated web capture worker should add:

```text
HTML snapshot
screenshot
response headers
retrieval timestamp
content SHA-256
```

The main Nightglass application must not become an arbitrary server-side URL fetcher. Web capture belongs in an isolated allowlisted worker with SSRF defenses and explicit analyst action.

## Completion criteria

- Source record hash is deterministic.
- Evidence record hash covers the canonical evidence metadata.
- Audit entries are written for evidence creation and major case mutations.
- Evidence can reference a finding/source.

---

# Phase 4 — TRACE orchestration

## Goal

Move from individual tool buttons to investigation profiles.

Analyst provides a subject and selects:

```text
QUICK TRACE
STANDARD TRACE
DEEP TRACE
```

Initial routing example:

| Target | Quick | Standard | Deep |
| --- | --- | --- | --- |
| email | Holehe + SIGNAL | Holehe + SIGNAL | Holehe + SIGNAL + SpiderFoot when supported |
| username | Sherlock + SIGNAL | Sherlock + SIGNAL | Sherlock + SIGNAL + SpiderFoot when supported |
| domain | SIGNAL | SIGNAL | SIGNAL + SpiderFoot when supported |
| IP | SIGNAL | SIGNAL | SIGNAL + additional approved connectors |
| company/person | SIGNAL sanctions/entity enrichment | SIGNAL | SIGNAL + RECORDS later |

Nightglass must select only engines that support the target type. A collector that is installed only as a companion must not be scheduled as though it has a working API adapter.

## Completion criteria

- `/trace` endpoint creates a deterministic set of jobs.
- Profiles are defined in code, versionable, and testable.
- Unsupported engines are returned as skipped with a reason rather than causing the whole trace to fail.

---

# Phase 5 — GRAPH

## Goal

Turn the relationship view from a visualization into an evidence-backed intelligence model.

Canonical entity types initially:

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

Initial relationship vocabulary:

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

Relationships carry:

- source/match/correlation confidence
- verification state
- source IDs
- evidence IDs
- first/last observed timestamps

## Completion criteria

- Duplicate canonical entities merge within a case.
- Relationships are queryable independently of findings.
- The graph UI uses entities/relationships rather than drawing every raw finding around the case node.

---

# Phase 6 — RECORDS

## Goal

Add authoritative/public-record sources that ShadowBroker does not replace.

Candidate source classes:

- Secretary of State / corporate registrations
- SEC filings
- property records
- licenses and permits
- court/public records where lawful and available
- sanctions/watchlists
- professional registrations
- government open-data datasets

Create a provider registry with per-provider terms, attribution, rate limits, query types, and provenance behavior.

## Completion criteria

- At least one structured government/public-record connector is implemented end-to-end.
- Provider attribution is retained in every resulting source record.
- No connector silently converts an inference into a verified fact.

---

# Phase 7 — PULSE

## Goal

Allow an investigation to become a watch after the initial case is built.

Use ShadowBroker's event/SSE capability only after the case pipeline is mature.

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

Watch examples:

- company
- domain
- username
- ASN
- aircraft/vessel only when GEO/SIGNAL expansion is intentionally enabled

## Completion criteria

- Watches are explicit and scoped to a case.
- Deduplication prevents repeated unchanged alerts.
- New findings retain the event/provider provenance that triggered them.

---

# Phase 8 — Investigative dossier/report layer

## Goal

Produce an exportable, defensible investigative dossier rather than a pile of screenshots.

Proposed report structure:

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

Every report statement should be classifiable as one of:

```text
FACT
CORROBORATED FINDING
LIKELY
INFERENCE
LEAD
CONFLICTING
UNVERIFIED
```

Exports later: JSON, CSV, HTML/PDF case dossier.

---

# Phase 9 — GEO remains deferred

Nightglass will not initially ingest a planet-scale OpenStreetMap/PostGIS/Overpass stack.

When geographic analysis is justified, prefer selective case-relevant queries through the SIGNAL provider boundary:

```text
Nightglass case
      ↓
case-relevant entities/events
      ↓
ShadowBroker GEO-capable data
      ↓
GRAPH | TIMELINE | MAP
```

This keeps the Nightglass core compact while preserving a path to richer geographic intelligence later.

---

# Cross-cutting requirements

## Security

- Loopback/private-network exposure by default.
- No arbitrary command execution.
- No arbitrary server-side URL fetching in the main app.
- Connector allowlists.
- Timeouts and output limits on all external providers.
- Secrets only from environment/secret management; never committed.
- Audit significant case mutations.

## Legal/ethical boundary

Nightglass is for lawful, authorized fraud prevention, compliance, due diligence, security, and investigative workflows. It must not be designed for harassment, stalking, doxxing, impersonation, unauthorized access, or bypassing access controls.

## Licensing

ShadowBroker is AGPL-3.0. Keep the Nightglass integration at an external service/API boundary. Do not copy ShadowBroker implementation source into Nightglass. Preserve upstream attribution and evaluate AGPL obligations before distributing a modified ShadowBroker service.

---

# Immediate execution queue

1. **Phase 0:** migrate schema and introduce canonical entities/sources/confidence fields.
2. **Phase 1:** add allowlisted passive ShadowBroker SIGNAL adapter.
3. **Phase 2:** route all engine findings through a universal normalizer.
4. **Phase 3:** upgrade ledger persistence and audit events.
5. **Phase 4:** add Quick / Standard / Deep TRACE orchestration API.
6. **Phase 5:** convert graph storage/UI to canonical entities + relationships.
7. **Phase 6:** implement first public-record provider.
8. Move SSO ahead of any multi-user or externally reachable deployment.
9. Keep PULSE, dossiers, and GEO behind the above foundation.
