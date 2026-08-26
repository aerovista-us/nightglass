# Evidence Capture Worker

Nightglass keeps evidence capture outside the main application process. The optional capture worker is a small Node service with no access to the Nightglass database or application secrets beyond its own request token.

## Current capability

The worker can preserve a bounded text/web response as a content-addressed snapshot:

- HTTP/HTTPS only
- ports 80/443 only
- DNS resolution before connection
- private, loopback, link-local, multicast, carrier-grade NAT, and other blocked address ranges rejected
- redirects revalidated at every hop
- response time limit
- response byte limit
- selected response headers preserved
- `Set-Cookie` and proxy-authentication headers omitted
- raw response body stored in a dedicated capture volume
- SHA-256 computed over the exact captured bytes
- capture metadata written into the Nightglass evidence ledger

The current worker captures HTML/text/JSON. **Screenshot rendering is not enabled yet.** That will be a separate browser-rendering layer so a Chromium runtime does not have to live in the core capture service.

## Why this is separate

A general-purpose server-side URL fetcher creates an SSRF path into private infrastructure. Nightglass therefore does not fetch evidence URLs in the main web process. The capture worker has a narrow API, strict outbound policy, bounded resources, and no Nightglass database mount.

## Configuration

Generate a long random token:

```bash
openssl rand -hex 32
```

Add it to the untracked `.env`:

```env
CAPTURE_WORKER_TOKEN=<generated-token>
CAPTURE_WORKER_URL=http://capture-worker:8090
CAPTURE_CLIENT_TIMEOUT_MS=30000
CAPTURE_TIMEOUT_MS=15000
CAPTURE_MAX_BYTES=5242880
CAPTURE_MAX_REDIRECTS=4
```

## Start the worker

```bash
docker compose --profile capture up -d --build
```

The capture worker is available to the Compose network only. It has no host port mapping.

To run SIGNAL and capture together:

```bash
docker compose --profile signal --profile capture up -d --build
```

## Analyst workflow

In the Evidence section of a case:

1. Enter the source URL.
2. Add a title and case-specific notes.
3. Choose **Record provenance** to store metadata only, or **Capture snapshot** to request an isolated snapshot.
4. Nightglass records both the evidence-record SHA-256 and, for snapshots, the independent content SHA-256.

The Evidence Ledger shows the snapshot reference and content hash. Nightglass does not render the captured HTML inside the application UI.

## Stored metadata

A captured evidence record includes:

```text
capture ID
requested URL
final URL
redirect chain
HTTP status
content type
response byte count
selected response headers
content SHA-256
snapshot reference
capture timestamp
Nightglass evidence SHA-256
```

The content hash answers: **“Are these captured bytes unchanged?”**

The evidence hash answers: **“Is the Nightglass provenance record itself unchanged?”**

## Known limitations / next step

- JavaScript-rendered pages may not preserve the same content a human sees in a browser.
- Screenshots are not yet produced.
- Authentication/session-based sites are intentionally unsupported; the worker does not accept analyst-supplied cookies or arbitrary request headers.
- Snapshot export/download will be added as an attachment-only path; Nightglass should not inline-render untrusted captured HTML.
- Browser screenshots, when added, should run in a second hardened sidecar with no private-network access and the same URL validation policy.
