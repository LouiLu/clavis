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
WORKDIR /workspace/apps/control-plane
RUN corepack enable
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/control-plane/node_modules /workspace/apps/control-plane/node_modules
COPY --from=build /workspace/apps/control-plane/dist /workspace/apps/control-plane/dist
COPY --from=build /workspace/apps/control-plane/prisma /workspace/apps/control-plane/prisma
COPY apps/control-plane/package.json /workspace/apps/control-plane/package.json
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
