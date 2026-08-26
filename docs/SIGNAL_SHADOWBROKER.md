# SIGNAL — ShadowBroker integration

Nightglass treats ShadowBroker as an **optional external intelligence provider**. Do not copy ShadowBroker source into Nightglass. Keep it as a separately deployed upstream service and communicate through its documented command API.

## Why this boundary exists

Nightglass owns:

- cases
- subjects and canonical entities
- findings
- relationships
- source provenance
- evidence
- audit history
- reports

ShadowBroker supplies selected passive enrichment. This keeps collection replaceable and keeps the AGPL-3.0 upstream at a clear service boundary.

## Nightglass configuration

```env
ENGINE_MODE=live
SHADOWBROKER_URL=http://127.0.0.1:8000
SHADOWBROKER_HMAC_SECRET=replace-with-a-strong-random-secret
SHADOWBROKER_TIMEOUT_MS=15000
```

When Nightglass and ShadowBroker run in separate containers, `SHADOWBROKER_URL` must be a private address/service name reachable from the Nightglass container. Do not publish the ShadowBroker backend to the public Internet just to make the integration work.

## ShadowBroker configuration

Use the same signing secret on the ShadowBroker side:

```env
OPENCLAW_HMAC_SECRET=replace-with-the-same-strong-random-secret
```

For the initial Nightglass integration, disable unrelated global telemetry and mesh features unless you intentionally need them:

```env
MESH_INFONET_FLEET_JOIN=false
MESH_MQTT_ENABLED=false
APRS_IS_ENABLED=false
PREDICTION_MARKETS_ENABLED=false
FINANCIAL_ENABLED=false
CROWDTHREAT_ENABLED=false
FIMI_ENABLED=false
NUFORC_ENABLED=false
NEWS_ENABLED=false
TELEGRAM_OSINT_ENABLED=false
```

The goal is to operate ShadowBroker as a **passive recon provider**, not to import its entire global dashboard into Nightglass.

## Nightglass allowlist

The first SIGNAL connector permits these ShadowBroker `osint_lookup` tools:

```text
dns
whois
certs
ip
sanctions
github
leaks
```

The connector deliberately does not expose `sweep_init` or `osint_sweep`.

Target routing:

| Nightglass target | ShadowBroker tools |
| --- | --- |
| domain | DNS, WHOIS/RDAP, certificate transparency |
| email | leak/breach presence |
| username | GitHub enrichment |
| IP | IP context |
| company/person | sanctions search |

## Connectivity test

After ShadowBroker is reachable and both sides have matching HMAC configuration:

```bash
npm run signal:check
```

Expected output resembles:

```json
{
  "ok": true,
  "expectedToolsPresent": true,
  "missing": []
}
```

This test performs capability discovery only. It does not run a subject investigation.

## Live case test

Run Nightglass with `ENGINE_MODE=live`, create a test case, add a benign test target you control or are authorized to investigate, and run **Quick TRACE** or choose `SIGNAL · ShadowBroker` directly.

Verify that the resulting case contains:

1. a completed ShadowBroker job;
2. normalized findings;
3. source records with provider `shadowbroker`;
4. source SHA-256 values;
5. canonical entities;
6. DNS/WHOIS-derived relationships when the returned data supports them.

## Failure behavior

A ShadowBroker failure is recorded as a failed Nightglass job with an audit event. It does not delete previous findings or make the whole case unusable.

Common failure causes:

- ShadowBroker URL is unreachable from the Nightglass runtime;
- HMAC secrets do not match;
- backend time differs enough for timestamp validation;
- the upstream tool is unavailable;
- an upstream provider rate-limits ShadowBroker.

## Security notes

- Keep both applications private by default.
- Never commit HMAC secrets.
- Prefer TLS if the HMAC-protected connection crosses hosts; HMAC protects integrity/authenticity, not confidentiality.
- Nightglass signs the exact canonical JSON bytes it sends so ShadowBroker can verify body integrity.
- Raw provider responses are preserved in the Nightglass provenance layer; do not treat every provider result as verified identity.
