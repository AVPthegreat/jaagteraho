# Build stage: compilers are needed only if better-sqlite3 has no prebuilt binary for this platform.
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
# ffmpeg: the wake-up voice note. Django lets the watcher run the model's regression test against the
# demo portal's code (fix proof); pip is removed again in the same layer.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages "django==5.1.15" \
  && apt-get purge -y python3-pip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 JR_DATA_DIR=/data
# The volume starts as a copy of this folder, so it must belong to the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "src/server.ts"]
