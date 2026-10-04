# syntax=docker/dockerfile:1.7
# KINETIX ERP (Next.js standalone server). Build from the repo root (the pnpm workspace):
#   docker build -f apps/erp/Dockerfile -t kinetix-erp .
#   docker run -p 3000:3000 -e KINETIX_API_URL=http://api:4000 kinetix-erp
# Runtime settings (KINETIX_API_URL, KINETIX_TIMEZONE, KINETIX_INSECURE_COOKIES) are read by the
# server at runtime, so one image serves every environment.
# Behind a TLS-intercepting proxy: --secret id=extra_ca,src=/path/to/ca.crt

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=10.0.0

# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm CI=true NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g --no-fund --no-audit "pnpm@${PNPM_VERSION}" && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/erp/package.json apps/erp/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter "@kinetix/erp..."
COPY apps/erp apps/erp
RUN pnpm --filter @kinetix/erp build

# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Kolkata
WORKDIR /app
# The standalone server keeps the workspace layout: apps/erp/server.js plus a traced node_modules.
COPY --from=build --chown=node:node /app/apps/erp/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/erp/.next/static apps/erp/.next/static
COPY --from=build --chown=node:node /app/apps/erp/public apps/erp/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "apps/erp/server.js"]
