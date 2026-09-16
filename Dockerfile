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

# Stage 3: minimal runtime image
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# RDS signs with Amazon's own CA, which Node does not trust by default; bundled at build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && mkdir -p /app/certs \
    && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/rds-global-bundle.pem \
    && rm -rf /var/lib/apt/lists/*
ENV DATABASE_SSL_CA=/app/certs/rds-global-bundle.pem
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
