# Stage 1: install dependencies
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: generate the Prisma client and build the app (standalone output)
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: RDS CA bundle, shared by the migrate and app images.
# RDS signs with Amazon's own CA, which Node does not trust by default; bundled at build time.
FROM node:24-slim AS certs
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && mkdir -p /certs \
    && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /certs/rds-global-bundle.pem \
    && rm -rf /var/lib/apt/lists/*

# Stage 4: one-shot Lambda that runs `prisma migrate deploy`
FROM public.ecr.aws/lambda/nodejs:24 AS migrate
WORKDIR ${LAMBDA_TASK_ROOT}
# Installed here, not copied, so Prisma fetches the schema engine for this image's platform.
COPY docker/migrate/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && rm -rf /root/.npm /root/.cache
# Lambda's filesystem is read-only outside /tmp; the CLI must not write a cache or phone home.
ENV HOME=/tmp
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY --from=certs /certs/rds-global-bundle.pem ${LAMBDA_TASK_ROOT}/certs/rds-global-bundle.pem
ENV DATABASE_SSL_CA=${LAMBDA_TASK_ROOT}/certs/rds-global-bundle.pem
COPY docker/migrate/migrate.mjs ./migrate.mjs
CMD ["migrate.handler"]

# Stage 5: minimal runtime image for the app (last, so a plain `docker build .` produces it)
FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=certs /certs/rds-global-bundle.pem /app/certs/rds-global-bundle.pem
ENV DATABASE_SSL_CA=/app/certs/rds-global-bundle.pem
# The adapter is a Lambda extension and is inert outside Lambda.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LWA_PORT=3000
ENV AWS_LWA_READINESS_CHECK_PATH=/api/health
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# .next/cache is Next.js's runtime cache; only /tmp is writable on Lambda.
RUN mkdir -p /tmp/next-cache && chown nextjs:nodejs /tmp/next-cache && ln -s /tmp/next-cache /app/.next/cache
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
