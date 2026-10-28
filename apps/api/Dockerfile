# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS tooling
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN wget -q https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -O /app/rds-global-bundle.pem
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY infra/package.json infra/package.json
RUN npm ci --workspace api --include-workspace-root --no-audit --no-fund
COPY apps/api/prisma.config.ts apps/api/tsconfig*.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src
COPY apps/api/container-bootstrap.cjs ./apps/api/container-bootstrap.cjs
WORKDIR /app/apps/api
# Generation/build do not connect to a database.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build
USER node
ENTRYPOINT ["node", "container-bootstrap.cjs"]

FROM tooling AS production-dependencies
USER root
WORKDIR /app
RUN npm prune --omit=dev --workspace api --include-workspace-root --no-audit --no-fund

FROM node:24-alpine AS runner
RUN apk add --no-cache openssl libc6-compat tzdata
ENV NODE_ENV=production TZ=UTC PORT=3000
WORKDIR /app/apps/api
COPY --chown=node:node --from=production-dependencies /app/node_modules /app/node_modules
COPY --chown=node:node --from=tooling /app/apps/api/package.json ./package.json
COPY --chown=node:node --from=tooling /app/apps/api/dist ./dist
COPY --chown=node:node --from=tooling /app/rds-global-bundle.pem /app/rds-global-bundle.pem
COPY --chown=node:node --from=tooling /app/apps/api/container-bootstrap.cjs ./container-bootstrap.cjs
USER node
ENTRYPOINT ["node", "container-bootstrap.cjs"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main"]
