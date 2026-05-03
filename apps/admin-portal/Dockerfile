FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin-portal/package.json apps/admin-portal/package.json
RUN pnpm install --filter @platform/admin-portal... --frozen-lockfile

FROM deps AS build
COPY apps/admin-portal apps/admin-portal
WORKDIR /workspace/apps/admin-portal
ARG VITE_CONTROL_PLANE_URL=http://localhost:4000
ENV VITE_CONTROL_PLANE_URL=$VITE_CONTROL_PLANE_URL
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/admin-portal/dist /usr/share/nginx/html
EXPOSE 80
