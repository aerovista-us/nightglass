# Deployment

## Local / server

```bash
cp .env.example .env
docker compose up -d --build
```

The default host bind is `127.0.0.1:3088`.

With the optional SpiderFoot companion:

```bash
docker compose --profile spiderfoot up -d --build
```

## Lightweight development mode

No third-party Node packages are required:

```bash
ENGINE_MODE=mock npm start
```

Open `http://127.0.0.1:3000`.

## Production routing

Keep the app loopback/internal and publish it through your normal authenticated reverse-proxy/tunnel layer. The app does not implement identity/authentication itself in v0.1.

## Storage

The app begins tiny. Allocate about 20–30 GB for runtime/cache overhead and use a 100 GB volume if you expect to retain evidence and case history locally.
