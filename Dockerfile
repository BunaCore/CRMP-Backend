# Stage 1: build deps
FROM node:20-slim AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source + config + TS configs
COPY src ./src
COPY drizzle.config.ts ./
COPY tsconfig.json tsconfig.build.json ./

# Build NestJS (needed if your migrations use compiled code)
RUN pnpm run build

# Stage 2: production backend
FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

# Copy configs for migrations
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.build.json ./tsconfig.build.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/src/main.js"]