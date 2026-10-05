# syntax=docker/dockerfile:1.7
# KINETIX code runner: compiles and runs C, C++ and Java for the code lab (server.mjs).
# Build from the repo root:
#   docker build -f services/code-runner/Dockerfile -t kinetix-code-runner .
# Run it only as docker-compose.yml does (no network, read-only, non-root, no capabilities,
# seccomp, limits); docs/operations/code-runner.md has the full list and the ECS setup.
# NODE_IMAGE can point at a registry mirror (e.g. mirror.gcr.io/library/node:22-bookworm-slim).

ARG NODE_IMAGE=node:22-bookworm-slim

# hadolint ignore=DL3006
FROM ${NODE_IMAGE}
# gcc/g++ 12 and OpenJDK 17 (Debian bookworm). util-linux gives prlimit; tini reaps
# zombies left by programs that fork.
RUN --mount=type=secret,id=extra_ca,required=false \
    apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev openjdk-17-jdk-headless util-linux tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 runner \
 && useradd --system --uid 10001 --gid runner --home-dir /tmp --shell /usr/sbin/nologin runner \
 && mkdir -p /run/kx-runner && chown runner:runner /run/kx-runner
WORKDIR /srv
COPY services/code-runner/server.mjs ./
USER 10001:10001
ENV NODE_ENV=production CODE_RUNNER_SOCKET=/run/kx-runner/runner.sock
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "const s=process.env.CODE_RUNNER_SOCKET;require('http').get(s?{socketPath:s,path:'/health'}:{port:process.env.PORT||8080,path:'/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
