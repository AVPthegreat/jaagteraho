FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates build-essential \
  && rm -rf /var/lib/apt/lists/*
# Django lets the watcher run the model's regression test against the demo portal's code (fix proof).
RUN pip3 install --no-cache-dir --break-system-packages "django==5.1.15"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apt-get purge -y build-essential && apt-get autoremove -y
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 JR_DATA_DIR=/data
# The volume starts as a copy of this folder, so it must belong to the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "src/server.ts"]
