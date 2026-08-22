# Security and investigation controls

Nightglass is intended for authorized fraud prevention, compliance, due-diligence, and defensive investigation workflows.

## Guardrails in v0.1

- Engine execution uses `spawn()` with `shell:false`.
- Only registered engines can be invoked.
- Username/email/domain inputs are validated and length-limited.
- Request bodies are size-limited.
- Container drops Linux capabilities and enables `no-new-privileges`.
- The default Compose port binds to loopback only.
- The evidence endpoint records user-supplied source metadata but deliberately does not server-side fetch arbitrary URLs, reducing SSRF exposure.
- No proxy rotation, CAPTCHA bypass, rate-limit evasion, credential testing, or account takeover features are included.

## Before public exposure

Put Nightglass behind an authenticated reverse proxy/SSO boundary. Do not expose the Docker port directly to the Internet.

## Investigation boundary

Use Nightglass only for lawful and authorized investigations. Do not use it to harass, stalk, dox, impersonate, or obtain unauthorized access to accounts or systems.
