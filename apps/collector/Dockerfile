FROM oven/bun:1 AS builder
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

WORKDIR /app/apps/collector
# Run as the image's unprivileged user
USER bun
CMD ["bun", "run", "src/index.ts"]
