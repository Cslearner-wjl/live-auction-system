#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app/apps/server
npx prisma migrate deploy --schema=prisma/schema.prisma

if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
  echo "Seeding demo data..."
  npx prisma db seed --schema=prisma/schema.prisma
fi

echo "Starting server..."
exec node dist/main.js
