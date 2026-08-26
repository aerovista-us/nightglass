# Architecture

## Product boundary

Nightglass is a local-first investigation intelligence platform with a controlled collection boundary. Nightglass owns cases, canonical entities, findings, relationships, source provenance, evidence, orchestration, and reporting. External tools remain replaceable providers behind adapters.

```text
Nightglass
├── CASES       investigation state
├── TRACE       multi-engine orchestration
├── SIGNAL      optional intelligence providers
├── GRAPH       canonical entities + relationships
├── LEDGER      source/evidence provenance
├── RECORDS     authoritative/public-record providers
├── PULSE       future watches/events
└── GEO         deferred/selective
```

## Runtime

- Node 22 web/API service.
- SQLite/WAL case store under a dedicated data volume.
- Additive schema migrations; existing v0.1 case data is retained.
- Allowlisted engine adapters only; no arbitrary shell execution.
- Sherlock for username discovery.
- Holehe for email-service presence checks.
- SpiderFoot remains an optional companion until a supported scan adapter exists.
- ShadowBroker is an optional SIGNAL provider accessed through its HMAC-authenticated command API; its source is not embedded in Nightglass.
- SEC company directory is the first RECORDS provider and uses a fixed government endpoint.
- No local geo/map dataset stack in the current architecture.

## Data model

```text
CASE
 ├── SUBJECT ──> canonical ENTITY
 ├── JOB
 │    └── FINDING
 │          ├── ENTITY
 │          └── SOURCE
 ├── ENTITY
 │    └── RELATIONSHIP ──> ENTITY
 │          └── SOURCE
 ├── EVIDENCE
 └── AUDIT LOG
```

### Subjects

Analyst-supplied starting points. Subject values are validated by type and attached to canonical case entities.

### Entities

Case-scoped canonical objects such as person, email, username, domain, IP, company, phone, address, account, document, vehicle, aircraft, or vessel. Canonical identity is unique by `(case_id, type, canonical_value)`.

### Findings

Engine/provider observations normalized into a common shape. Findings retain raw provider output plus normalized data and separate confidence dimensions:

- source confidence
- match confidence
- correlation confidence
- freshness
- verification status

### Sources

Immutable-ish provenance records attached to findings. Source records preserve provider, query, URL, retrieval timestamp, raw provider response, and a deterministic SHA-256 record hash.

### Relationships

Evidence-backed links between canonical entities. Relationships maintain their own confidence dimensions, verification status, first/last observation timestamps, and source references.

### Evidence

Analyst-reviewed provenance records. Manual evidence currently records URL, notes, provider/context, optional finding/source linkage, verification status, and SHA-256. Arbitrary URL fetching remains outside the main application; a future isolated capture worker will handle snapshots/screenshots with SSRF controls.

## TRACE orchestration

TRACE profiles are versioned code, not ad-hoc UI behavior:

- **Quick** — minimal high-value engines.
- **Standard** — normal case enrichment.
- **Deep** — broader set; unsupported companion adapters are reported as skipped rather than failing the trace.

The orchestrator schedules only engines supporting the target type and skips providers missing required configuration in live mode.

## SIGNAL boundary

ShadowBroker is treated as an upstream service. Nightglass currently allowlists passive `osint_lookup` tools only: DNS, WHOIS/RDAP, certificate transparency, IP context, sanctions, GitHub account enrichment, and leak/breach presence as applicable to the target type. Active subnet sweep commands are intentionally not exposed.

## RECORDS boundary

RECORDS providers use fixed allowlisted endpoints and preserve attribution. The initial SEC provider searches the SEC company ticker/directory dataset and requires a configured `SEC_USER_AGENT` for live requests.

## Security invariants

- Private/loopback exposure by default.
- No arbitrary commands.
- No arbitrary provider URLs from analyst input.
- HMAC body binding for remote ShadowBroker requests.
- External request timeouts and result caps.
- Secrets from environment/secret management only.
- Significant case mutations written to the audit log.
