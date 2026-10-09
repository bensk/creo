# syntax=docker/dockerfile:1
# Two images from one build:
#   app:   the Next.js standalone server (Cloud Run service)
#   tools: full source and dependencies for one-off jobs (migrations, Directory
#          sync, the AI grant CLI), run as Cloud Run jobs: `pnpm <script>`

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM node:22-slim AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]

FROM deps AS tools
COPY . .
ENV NODE_ENV=production
USER node
ENTRYPOINT ["pnpm"]
CMD ["--help"]
