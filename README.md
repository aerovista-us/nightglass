# Nightglass

**Find the signal. Follow the thread.**

Nightglass is a local-first investigation intelligence platform for authorized fraud prevention, operational compliance, due diligence, and defensive OSINT workflows.

The first release focuses on the investigative core: cases, subjects, controlled enrichment, normalized findings, relationship analysis, and evidence provenance. Geographic datasets are intentionally deferred to keep the deployment compact.

## v0.1 capabilities

- Case and subject management
- Sherlock username discovery adapter
- Holehe email-service presence adapter
- Optional SpiderFoot companion profile
- Normalized findings and job history
- Lightweight relationship graph
- Evidence provenance ledger with SHA-256 record hashing
- Docker-first local deployment
- Mock engine mode for development and CI
- Loopback-only binding by default
- No geographic dataset or map stack in v0.1

## Quick start

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://127.0.0.1:3088`.

### Docker + SpiderFoot

```bash
docker compose --profile spiderfoot up -d --build
```

### Dependency-free UI/API development

Requires Node 22.5+.

```bash
ENGINE_MODE=mock npm start
```

Then open `http://127.0.0.1:3000`.

## Architecture

```text
Nightglass
├── CASES       investigation workspace
├── TRACE       controlled local enrichment
├── SIGNAL      optional upstream intelligence providers
├── GRAPH       entity relationships
├── LEDGER      evidence + provenance
├── RECORDS     public-record connectors
├── PULSE       future monitoring
└── GEO         reserved; not deployed in v0.1
```

Nightglass does not execute arbitrary commands or fetch arbitrary URLs server-side. Engine execution is allowlisted and evidence provenance is recorded without creating an SSRF-capable fetch surface.

## Operating boundary

Nightglass is intended for lawful, authorized investigations. Do not use it to harass, stalk, dox, impersonate, or obtain unauthorized access to accounts or systems.

Do not expose the application directly to the public Internet. The default Compose configuration binds Nightglass to loopback. Put it behind an authenticated reverse proxy or SSO layer for remote access.

See [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), and the canonical [`docs/roadmap.md`](docs/roadmap.md).
