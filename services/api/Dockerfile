# syntax=docker/dockerfile:1.7
# KINETIX Cloud API (NestJS, ESM). Build from the repo root (the pnpm workspace):
#   docker build -f services/api/Dockerfile -t kinetix-api .
# Modes (see docker-entrypoint.sh): serve (default), migrate, seed, content-import, db-bootstrap.
#   docker run --rm --env-file api.env kinetix-api migrate   # one-off, owner role, before deploy
#   docker run --init -p 4000:4000 --env-file api.env kinetix-api
#
# Behind a TLS-intercepting proxy, pass its CA as a build secret:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt ...
# NODE_IMAGE can point at a registry mirror (e.g. mirror.gcr.io/library/node:22-bookworm-slim).

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=10.0.0

# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g --no-fund --no-audit "pnpm@${PNPM_VERSION}" && pnpm config set store-dir /pnpm/store
WORKDIR /app

# Workspace manifests only, so the dependency layers are cached until a manifest changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/erp/package.json apps/erp/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter "@kinetix/api..."
COPY packages/shared packages/shared
COPY services/api services/api
RUN pnpm --filter @kinetix/shared build && pnpm --filter @kinetix/api build

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --prod --filter "@kinetix/api..."

# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Asia/Kolkata \
    LOG_FORMAT=json \
    STORAGE_DIR=/app/services/api/.data/objects
WORKDIR /app
# node_modules (pnpm layout: root .pnpm store + per-package symlinks), then the compiled code.
COPY --from=prod-deps --chown=root:root /app /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/api/dist services/api/dist
COPY services/api/migrations services/api/migrations
COPY services/api/content services/api/content
COPY --chmod=0755 services/api/docker-entrypoint.sh /usr/local/bin/kinetix-api
COPY infra/docker/db-bootstrap.mjs services/api/db-bootstrap.mjs
# Amazon RDS CA bundle (ap-south-1), so database URLs can use sslmode=verify-full with
# NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ap-south-1-bundle.pem (set in the ECS task).
ADD --chmod=0644 https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem /etc/ssl/certs/rds-ap-south-1-bundle.pem
# Local recordings (STORAGE_DRIVER=local) are the only writes; production uses S3.
RUN mkdir -p services/api/.data/objects && chown -R node:node services/api/.data
WORKDIR /app/services/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["kinetix-api"]
CMD ["serve"]
