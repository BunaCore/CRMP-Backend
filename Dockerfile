FROM node:20-slim AS builder

WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
RUN ls node_modules | grep express

COPY src ./src
COPY tsconfig.json tsconfig.build.json drizzle.config.ts ./
RUN pnpm run build


FROM node:20-slim AS runner

WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/src/main.js"]