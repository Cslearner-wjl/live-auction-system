FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @live-auction/shared build \
  && pnpm --filter @live-auction/server prisma:generate \
  && pnpm --filter @live-auction/server build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]
