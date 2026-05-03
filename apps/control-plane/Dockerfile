FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/control-plane/package.json apps/control-plane/package.json
RUN pnpm install --filter @platform/control-plane... --frozen-lockfile

FROM deps AS build
COPY apps/control-plane apps/control-plane
WORKDIR /workspace/apps/control-plane
RUN pnpm prisma:generate
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=deps /workspace/node_modules /workspace/node_modules
COPY --from=deps /workspace/apps/control-plane/node_modules ./node_modules
COPY --from=build /workspace/apps/control-plane/dist ./dist
COPY --from=build /workspace/apps/control-plane/prisma ./prisma
COPY apps/control-plane/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/main.js"]
