# BINGO+ API — production image (multi-stage build)
# Build from the monorepo root: docker build -f apps/api/Dockerfile -t bingoplus-api .

FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci

FROM deps AS build
COPY apps/api ./apps/api
# Shared workspace packages ship TS source; compile them to dist/ so plain `node` (no ts-node in
# the runtime image) can require() them — @bingoplus/utils's package.json "main" points at dist/.
RUN npm run build --workspace=packages/utils
RUN npm run build --workspace=packages/types
RUN npm run prisma:generate --workspace=apps/api
RUN npm run build --workspace=apps/api

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
# npm workspaces hoist installed packages AND the generated Prisma client to the repo-root
# node_modules — copy that (from the `build` stage, so it's post `prisma generate`), not the
# per-package node_modules, which stays empty under this workspace layout.
COPY --from=build /repo/node_modules ./node_modules
# @bingoplus/types and @bingoplus/utils are npm-workspace symlinks under node_modules pointing
# at ../../packages/* — the actual source has to exist in the image too, not just the symlink.
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma

EXPOSE 3001
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
