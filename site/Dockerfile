# The website as a container (for a server instead of Vercel). Next.js "standalone" output keeps the image small.
#   docker build --build-arg NEXT_PUBLIC_WATCHER_URL=https://api.example.com \
#                --build-arg NEXT_PUBLIC_SITE_URL=https://site.example.com -t jaagteraho-site site
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* values are baked into the browser bundle at build time.
ARG NEXT_PUBLIC_WATCHER_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_WATCHER_URL=$NEXT_PUBLIC_WATCHER_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_WATCHER_URL" && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
