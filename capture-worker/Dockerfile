FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    CAPTURE_HOST=0.0.0.0 \
    CAPTURE_PORT=8090 \
    CAPTURE_DIR=/captures

RUN useradd --create-home --uid 10001 capture \
    && mkdir -p /app /captures \
    && chown -R capture:capture /app /captures

WORKDIR /app
COPY --chown=capture:capture capture-worker/ ./
USER capture

EXPOSE 8090
CMD ["node", "server.mjs"]
