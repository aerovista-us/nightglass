# Architecture

## v0.1 goals

Nightglass is a small, local-first investigation intelligence platform with a controlled execution boundary.

- Node 22 single-process web/API service.
- SQLite/WAL case store under a dedicated data volume.
- Allowlisted engine adapters only; no arbitrary shell execution.
- Sherlock for username discovery.
- Holehe for email-service presence checks.
- SpiderFoot as an optional companion container; deep API orchestration is deferred.
- Manual evidence ledger with canonical SHA-256 hashes.
- No geo stack in v0.1.

## Data model

Case → Subjects → Jobs → Findings

Case → Evidence

Every finding keeps the engine, job, raw normalized payload, timestamp, and confidence estimate.
