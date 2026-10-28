# Build from repository root with the Dockerfile-specific context allowlist.
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY infra/package.json infra/package.json
RUN npm ci --workspace web --include-workspace-root --no-audit --no-fund
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL=https://api-aws.congtc145.id.vn/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build --workspace web

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY --chown=101:101 apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --chown=101:101 --from=builder /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
